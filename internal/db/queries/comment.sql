-- name: ListCommentsByTask :many
SELECT * FROM comment WHERE task_id = ? ORDER BY created_at;

-- name: CreateComment :one
INSERT INTO comment (id, task_id, content, created_at)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: DeleteComment :execrows
DELETE FROM comment WHERE id = ?;
