-- Backup restore: bulk-insert the snapshot tables in FK order.
-- Clears are done by the service inside one transaction (see ImportBackup).
-- name: ImportWorkspaces :exec
INSERT INTO workspace (id, name, created_at) VALUES (?, ?, ?);

-- name: ImportProjects :exec
INSERT INTO project (id, workspace_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);

-- name: ImportColumns :exec
INSERT INTO column (id, project_id, name, position, wip_limit, created_at) VALUES (?, ?, ?, ?, ?, ?);

-- name: ImportMilestones :exec
INSERT INTO milestone (id, project_id, name, due_date, created_at) VALUES (?, ?, ?, ?, ?);

-- name: ImportTasks :exec
INSERT INTO task (id, project_id, column_id, title, description, position, priority, due_date, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: ImportLabels :exec
INSERT INTO label (id, project_id, name, created_at) VALUES (?, ?, ?, ?);

-- name: ImportComments :exec
INSERT INTO comment (id, task_id, content, created_at, author) VALUES (?, ?, ?, ?, ?);

-- name: ImportActivities :exec
INSERT INTO activity (id, resource_type, resource_id, project_id, workspace_id, action, data, created_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: ImportTaskLabels :exec
INSERT INTO task_label (task_id, label_id) VALUES (?, ?);

-- name: ImportTaskMilestones :exec
INSERT INTO task_milestone (task_id, milestone_id) VALUES (?, ?);

-- name: ImportMembers :exec
INSERT INTO member (id, workspace_id, name, role, avatar_color, avatar, access_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
