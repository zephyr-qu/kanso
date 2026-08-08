-- name: ListTasksByProject :many
SELECT * FROM task WHERE project_id = ? ORDER BY position, created_at;
