-- name: ListTasksByProject :many
SELECT * FROM task WHERE project_id = ? ORDER BY position, created_at;

-- name: ListTasksByColumn :many
SELECT * FROM task WHERE column_id = ? ORDER BY position, created_at;

-- name: GetTask :one
SELECT * FROM task WHERE id = ?;

-- name: MaxTaskPositionByColumn :one
SELECT COALESCE(MAX(position), -1) + 1 FROM task WHERE column_id = ?;

-- name: CreateTask :one
INSERT INTO task (id, project_id, column_id, title, description, position, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateTask :one
UPDATE task SET title = ?, description = ?, updated_at = ? WHERE id = ? RETURNING *;

-- name: SetTaskPosition :exec
UPDATE task SET column_id = ?, position = ?, updated_at = ? WHERE id = ?;

-- name: DeleteTask :execrows
DELETE FROM task WHERE id = ?;
