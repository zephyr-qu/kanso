-- name: ListActivitiesByResource :many
SELECT * FROM activity WHERE resource_type = ? AND resource_id = ? ORDER BY created_at DESC;

-- name: CreateActivity :one
INSERT INTO activity (id, resource_type, resource_id, project_id, workspace_id, action, data, created_at, actor)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: DeleteActivityByTask :exec
DELETE FROM activity WHERE resource_type = 'task' AND resource_id = ?;

-- name: DeleteActivitiesByColumn :exec
DELETE FROM activity
WHERE resource_type = 'task' AND resource_id IN (SELECT t.id FROM task AS t WHERE t.column_id = ?);

-- name: DeleteActivitiesByProject :exec
DELETE FROM activity WHERE project_id = ?;

-- name: DeleteActivitiesByWorkspace :exec
DELETE FROM activity
WHERE activity.workspace_id = sqlc.arg(workspace_id)
   OR project_id IN (SELECT p.id FROM project AS p WHERE p.workspace_id = sqlc.arg(workspace_id));

-- name: ReownLegacyActivities :execrows
UPDATE activity SET actor = ? WHERE actor = 'Admin';
