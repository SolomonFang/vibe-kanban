use std::sync::Arc;

use async_trait::async_trait;
use db::{self, DBService, models::execution_process::ExecutionProcess};
use executors::approvals::{ExecutorApprovalError, ExecutorApprovalService};
use serde_json::Value;
use tokio_util::sync::CancellationToken;
use utils::approvals::{
    ApprovalRequest, ApprovalStatus, CreateApprovalRequest, QuestionStatus,
};
use uuid::Uuid;

use crate::services::{approvals::Approvals, notification::NotificationService};

pub struct ExecutorApprovalBridge {
    approvals: Approvals,
    db: DBService,
    notification_service: NotificationService,
    execution_process_id: Uuid,
}

impl ExecutorApprovalBridge {
    pub fn new(
        approvals: Approvals,
        db: DBService,
        notification_service: NotificationService,
        execution_process_id: Uuid,
    ) -> Arc<Self> {
        Arc::new(Self {
            approvals,
            db,
            notification_service,
            execution_process_id,
        })
    }
}

#[async_trait]
impl ExecutorApprovalService for ExecutorApprovalBridge {
    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
        cancel: CancellationToken,
    ) -> Result<ApprovalStatus, ExecutorApprovalError> {
        super::ensure_task_in_review(&self.db.pool, self.execution_process_id).await;

        let request = ApprovalRequest::from_create(
            CreateApprovalRequest {
                tool_name: tool_name.to_string(),
                tool_input,
                tool_call_id: tool_call_id.to_string(),
            },
            self.execution_process_id,
        );

        let (request, waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        let approval_id = request.id.clone();

        let task_name = ExecutionProcess::load_context(&self.db.pool, self.execution_process_id)
            .await
            .map(|ctx| ctx.task.title)
            .unwrap_or_else(|_| "Unknown task".to_string());

        self.notification_service
            .notify(
                &format!("Approval Needed: {}", task_name),
                &format!("Tool '{}' requires approval", tool_name),
            )
            .await;

        let status = tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Approval request cancelled for tool_call_id={}", tool_call_id);
                self.approvals.cancel(&approval_id).await;
                return Err(ExecutorApprovalError::Cancelled);
            }
            status = waiter.clone() => status,
        };

        if matches!(status, ApprovalStatus::Pending) {
            return Err(ExecutorApprovalError::request_failed(
                "approval finished in pending state",
            ));
        }

        Ok(status)
    }

    async fn request_question_answer(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
        _question_count: usize,
        cancel: CancellationToken,
    ) -> Result<QuestionStatus, ExecutorApprovalError> {
        // Create an approval request so the frontend shows pending UI
        let request = ApprovalRequest::from_create(
            CreateApprovalRequest {
                tool_name: tool_name.to_string(),
                tool_input,
                tool_call_id: tool_call_id.to_string(),
            },
            self.execution_process_id,
        );

        let approval_id = request.id.clone();

        // Create both the approval waiter (for UI) and a question waiter (for answers)
        let (_request, approval_waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        let question_waiter = self
            .approvals
            .add_question_waiter(&approval_id, self.execution_process_id);

        // Wait for the user to answer, cancel, or timeout
        let result = tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Question request cancelled");
                self.approvals.cancel(&approval_id).await;
                Err(ExecutorApprovalError::Cancelled)
            }
            status = question_waiter.clone() => {
                // User submitted answers via the respond endpoint
                Ok(status)
            }
            status = approval_waiter.clone() => {
                // Approval completed without question answers (denied or timed out)
                tracing::info!("Question approval completed without answers: {:?}", status);
                Ok(QuestionStatus::TimedOut)
            }
        };

        // Clean up
        self.approvals.cancel(&approval_id).await;

        result
    }
}
