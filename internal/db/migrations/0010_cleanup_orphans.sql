-- 0010_cleanup_orphans: 清理历史版本遗留的孤儿业务记录。
-- 旧版本曾在外键级联未启用时留下无归属的列/任务/标签/里程碑，
-- 这些记录会被备份导出并在恢复时触发外键错误。

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
   OR column_id NOT IN (SELECT id FROM column);

DELETE FROM column
WHERE project_id NOT IN (SELECT id FROM project);

DELETE FROM label
WHERE project_id IS NOT NULL
  AND project_id NOT IN (SELECT id FROM project);

DELETE FROM milestone
WHERE project_id NOT IN (SELECT id FROM project);

