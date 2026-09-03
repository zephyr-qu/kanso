-- 0016_cleanup_workspace_orphans: 清理开发期间可能残留的跨作用域孤儿数据。
-- 工作区体系化后，所有业务记录都必须能沿 project 反查到有效 workspace。
DELETE FROM task_label
WHERE task_id NOT IN (SELECT id FROM task)
   OR label_id NOT IN (SELECT id FROM label);

DELETE FROM task_milestone
WHERE task_id NOT IN (SELECT id FROM task)
   OR milestone_id NOT IN (SELECT id FROM milestone);

DELETE FROM comment
WHERE task_id NOT IN (SELECT id FROM task);

DELETE FROM task
WHERE project_id NOT IN (SELECT id FROM project)
   OR column_id NOT IN (SELECT id FROM column)
   OR project_id NOT IN (SELECT project_id FROM column)
   OR project_id NOT IN (SELECT p.id FROM project p JOIN workspace w ON w.id = p.workspace_id);

DELETE FROM column
WHERE project_id NOT IN (SELECT p.id FROM project p JOIN workspace w ON w.id = p.workspace_id);

DELETE FROM label
WHERE project_id IS NOT NULL
  AND project_id NOT IN (SELECT p.id FROM project p JOIN workspace w ON w.id = p.workspace_id);

DELETE FROM milestone
WHERE project_id NOT IN (SELECT p.id FROM project p JOIN workspace w ON w.id = p.workspace_id);

DELETE FROM project
WHERE workspace_id NOT IN (SELECT id FROM workspace);
