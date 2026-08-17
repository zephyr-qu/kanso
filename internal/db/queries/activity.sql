-- name: ListActivitiesByResource :many
SELECT * FROM activity WHERE resource_type = ? AND resource_id = ? ORDER BY created_at DESC;

-- name: CreateActivity :one
INSERT INTO activity (id, resource_type, resource_id, action, data, created_at, actor)
VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: DeleteActivityByTask :exec
DELETE FROM activity WHERE resource_type = 'task' AND resource_id = ?;

-- name: DeleteActivitiesByColumn :exec
DELETE FROM activity WHERE resource_type = 'task' AND resource_id IN (SELECT id FROM task WHERE column_id = ?);

-- name: DeleteActivitiesByProject :exec
DELETE FROM activity WHERE resource_type = 'task' AND resource_id IN (SELECT id FROM task WHERE project_id = ?);

-- name: DeleteActivitiesByWorkspace :exec
DELETE FROM activity WHERE resource_type = 'task' AND resource_id IN (SELECT id FROM task WHERE project_id IN (SELECT id FROM project WHERE workspace_id = ?));

-- name: ReownLegacyActivities :execrows
UPDATE activity SET actor = ? WHERE actor = 'Admin';
