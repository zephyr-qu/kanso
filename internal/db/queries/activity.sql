-- name: ListActivitiesByResource :many
SELECT * FROM activity WHERE resource_type = ? AND resource_id = ? ORDER BY created_at DESC;

-- name: CreateActivity :one
INSERT INTO activity (id, resource_type, resource_id, action, data, created_at)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;
