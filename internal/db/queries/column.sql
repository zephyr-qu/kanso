-- name: ListColumnsByProject :many
SELECT * FROM column WHERE project_id = ? ORDER BY position, created_at;

-- name: CountColumnsByProject :one
SELECT COUNT(*) FROM column WHERE project_id = ?;

-- name: GetColumn :one
SELECT * FROM column WHERE id = ?;

-- name: CreateColumn :one
INSERT INTO column (id, project_id, name, position, created_at)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateColumnName :one
UPDATE column SET name = ? WHERE id = ? RETURNING *;

-- name: SetColumnPosition :exec
UPDATE column SET position = ? WHERE id = ?;

-- name: DeleteColumn :execrows
DELETE FROM column WHERE id = ?;
