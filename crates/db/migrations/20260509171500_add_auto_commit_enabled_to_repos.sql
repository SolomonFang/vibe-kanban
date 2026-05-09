-- Add per-repository auto commit toggle.
ALTER TABLE repos
ADD COLUMN auto_commit_enabled INTEGER NOT NULL DEFAULT 1;
