-- name: ListCommentsByTask :many
SELECT * FROM comment WHERE task_id = ? ORDER BY created_at;

-- name: GetComment :one
SELECT * FROM comment WHERE id = ?;

-- name: CreateComment :one
INSERT INTO comment (id, task_id, content, created_at, author)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: DeleteComment :execrows
DELETE FROM comment WHERE id = ?;

-- name: CountCommentsByProject :many
-- Comment counts per task within a project (board task card meta).
SELECT task_id, COUNT(*) AS comment_count
FROM comment
WHERE task_id IN (SELECT id FROM task WHERE project_id = ?)
GROUP BY task_id;

-- name: ReownLegacyComments :execrows
UPDATE comment SET author = ? WHERE author = 'Admin';
