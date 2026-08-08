-- name: ListColumnsByProject :many
SELECT * FROM column WHERE project_id = ? ORDER BY position, created_at;

-- name: CountColumnsByProject :one
SELECT COUNT(*) FROM column WHERE project_id = ?;

-- name: CreateColumn :one
INSERT INTO column (id, project_id, name, position, created_at)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateColumnName :one
UPDATE column SET name = ? WHERE id = ? RETURNING *;

-- name: DeleteColumn :exec
DELETE FROM column WHERE id = ?;
