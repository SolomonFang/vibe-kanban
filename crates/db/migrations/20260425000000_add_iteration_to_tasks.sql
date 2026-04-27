-- Add iteration field to tasks for sprint/iteration grouping.
-- Stores 6-digit code (YYMMDD), e.g. "260116". NULL means no iteration.
-- Allowed values are controlled by the frontend enum (frontend/src/constants/iterations.ts),
-- intentionally without a CHECK constraint so adding new iterations doesn't require a migration.

ALTER TABLE tasks ADD COLUMN iteration TEXT;

CREATE INDEX idx_tasks_iteration ON tasks(iteration) WHERE iteration IS NOT NULL;
