-- name: ListProjectsByWorkspace :many
SELECT * FROM project WHERE workspace_id = ? ORDER BY position, created_at;

-- name: GetProject :one
SELECT * FROM project WHERE id = ?;

-- name: CreateProject :one
INSERT INTO project (id, workspace_id, name, position, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateProjectName :one
UPDATE project SET name = ?, updated_at = ? WHERE id = ? RETURNING *;

-- name: DeleteProject :execrows
DELETE FROM project WHERE id = ?;
