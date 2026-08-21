-- 0013_activity_scope_audit: 活动记录是审计历史，作用域对象删除后仍需保留其 ID。
-- 0012 的早期版本曾给新增列加外键；重建表以兼容已经执行过该版本的数据库。
CREATE TABLE activity_scope_audit (
    id TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    project_id TEXT,
    workspace_id TEXT,
    action TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'Admin'
);

INSERT INTO activity_scope_audit (id, resource_type, resource_id, project_id, workspace_id, action, data, created_at, actor)
SELECT id, resource_type, resource_id, project_id, workspace_id, action, data, created_at, actor
FROM activity;

DROP TABLE activity;
ALTER TABLE activity_scope_audit RENAME TO activity;

CREATE INDEX idx_activity_resource ON activity (resource_type, resource_id);
CREATE INDEX idx_activity_project ON activity (project_id, created_at);
CREATE INDEX idx_activity_workspace ON activity (workspace_id, created_at);
