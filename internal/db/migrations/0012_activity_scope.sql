-- 0012_activity_scope: 活动记录不再只绑定任务，补充项目/工作区归属。
-- 这样列、标签、里程碑、成员等写操作也能进入全局活动流；资源删除后
-- 仍可依靠 scope ID 保留审计记录，因此作用域列不建立外键。
ALTER TABLE activity ADD COLUMN project_id TEXT;
ALTER TABLE activity ADD COLUMN workspace_id TEXT;
UPDATE activity
SET project_id = (
    SELECT t.project_id FROM task AS t
    WHERE t.id = activity.resource_id AND activity.resource_type = 'task'
), workspace_id = (
    SELECT p.workspace_id FROM project AS p
    WHERE p.id = (
        SELECT t.project_id FROM task AS t
        WHERE t.id = activity.resource_id AND activity.resource_type = 'task'
    )
)
WHERE activity.resource_type = 'task';
CREATE INDEX idx_activity_project ON activity (project_id, created_at);
CREATE INDEX idx_activity_workspace ON activity (workspace_id, created_at);
