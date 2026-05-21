//! Bootstrap Claude Code permission settings for vibe-kanban git worktrees.
//!
//! Copied worktrees live under a new path (e.g. `~/.vibe-kanban/.../workspaces/...`).
//! Claude Code does not inherit allow rules from the original repo or global settings for
//! that path, so Edit/Write keep failing with "you haven't granted permission" until
//! `.claude/settings.local.json` exists in the worktree.

use std::path::Path;

use db::models::repo::Repo;
use services::services::container::ContainerError;
use tokio::fs;

/// Default permissions for isolated worktrees when the source repo has no Claude config.
const DEFAULT_WORKTREE_CLAUDE_SETTINGS: &str = r#"{
  "defaultMode": "acceptEdits",
  "permissions": {
    "allow": [
      "Bash",
      "Edit",
      "Write",
      "Read",
      "Glob",
      "Grep",
      "NotebookEdit"
    ]
  }
}
"#;

/// Ensure each repo worktree under `workspace_dir` has Claude Code permission settings.
pub async fn ensure_claude_permissions_for_workspace(
    workspace_dir: &Path,
    repos: &[Repo],
) -> Result<(), ContainerError> {
    for repo in repos {
        if !repo.use_worktree {
            continue;
        }
        let worktree_path = workspace_dir.join(&repo.name);
        if !worktree_path.is_dir() {
            continue;
        }
        ensure_claude_permissions_for_worktree(&worktree_path, &repo.path).await?;
    }
    Ok(())
}

async fn ensure_claude_permissions_for_worktree(
    worktree_path: &Path,
    source_repo_path: &Path,
) -> Result<(), ContainerError> {
    let claude_dir = worktree_path.join(".claude");
    let target_settings = claude_dir.join("settings.local.json");

    if target_settings.exists() {
        tracing::trace!(
            "Claude settings.local.json already exists in {}",
            worktree_path.display()
        );
        return Ok(());
    }

    fs::create_dir_all(&claude_dir)
        .await
        .map_err(ContainerError::Io)?;

    let source_local = source_repo_path.join(".claude/settings.local.json");
    let source_shared = source_repo_path.join(".claude/settings.json");

    if source_local.is_file() {
        fs::copy(&source_local, &target_settings)
            .await
            .map_err(ContainerError::Io)?;
        tracing::info!(
            "Copied Claude permissions from {} to {}",
            source_local.display(),
            target_settings.display()
        );
        return Ok(());
    }

    if source_shared.is_file() {
        fs::copy(&source_shared, &target_settings)
            .await
            .map_err(ContainerError::Io)?;
        tracing::info!(
            "Copied Claude permissions from {} to {}",
            source_shared.display(),
            target_settings.display()
        );
        return Ok(());
    }

    fs::write(&target_settings, DEFAULT_WORKTREE_CLAUDE_SETTINGS)
        .await
        .map_err(ContainerError::Io)?;
    tracing::info!(
        "Created default Claude worktree permissions at {}",
        target_settings.display()
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use chrono::Utc;
    use tempfile::tempdir;
    use uuid::Uuid;

    use super::*;

    fn test_repo(name: &str, path: std::path::PathBuf, use_worktree: bool) -> Repo {
        let now = Utc::now();
        Repo {
            id: Uuid::new_v4(),
            path,
            name: name.to_string(),
            display_name: name.to_string(),
            setup_script: None,
            cleanup_script: None,
            archive_script: None,
            copy_files: None,
            parallel_setup_script: false,
            use_worktree,
            auto_commit_enabled: false,
            dev_server_script: None,
            default_target_branch: None,
            default_working_dir: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[tokio::test]
    async fn writes_default_settings_when_source_has_no_claude_dir() {
        let workspace = tempdir().unwrap();
        let source = tempdir().unwrap();
        let worktree = workspace.path().join("my-repo");
        fs::create_dir_all(&worktree).unwrap();

        let repo = test_repo("my-repo", source.path().to_path_buf(), true);

        ensure_claude_permissions_for_workspace(workspace.path(), std::slice::from_ref(&repo))
            .await
            .unwrap();

        let settings = worktree.join(".claude/settings.local.json");
        assert!(settings.is_file());
        let content = fs::read_to_string(&settings).unwrap();
        assert!(content.contains("acceptEdits"));
        assert!(content.contains("\"Edit\""));
    }

    #[tokio::test]
    async fn copies_source_settings_local_when_present() {
        let workspace = tempdir().unwrap();
        let source = tempdir().unwrap();
        let worktree = workspace.path().join("my-repo");
        fs::create_dir_all(&worktree).unwrap();
        fs::create_dir_all(source.path().join(".claude")).unwrap();
        fs::write(
            source.path().join(".claude/settings.local.json"),
            r#"{"permissions":{"allow":["Edit"]}}"#,
        )
        .unwrap();

        let repo = test_repo("my-repo", source.path().to_path_buf(), true);

        ensure_claude_permissions_for_workspace(workspace.path(), std::slice::from_ref(&repo))
            .await
            .unwrap();

        let content = fs::read_to_string(worktree.join(".claude/settings.local.json")).unwrap();
        assert!(content.contains("Edit"));
    }
}
