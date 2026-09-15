-- 0017_project_archived: 项目软归档（完成后收起，可恢复；与任务 archived_at 口径一致）。
ALTER TABLE project ADD COLUMN archived_at TEXT;
CREATE INDEX idx_project_archived ON project (workspace_id, archived_at);
