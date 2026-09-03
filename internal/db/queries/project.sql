-- name: ListProjectsByWorkspace :many
SELECT id, workspace_id, name, position, created_at, updated_at FROM project WHERE workspace_id = ? ORDER BY position, created_at;

-- name: GetProject :one
SELECT id, workspace_id, name, position, created_at, updated_at FROM project WHERE id = ?;

-- name: CreateProject :one
INSERT INTO project (id, workspace_id, name, position, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING id, workspace_id, name, position, created_at, updated_at;

-- name: UpdateProjectName :one
UPDATE project SET name = ?, updated_at = ? WHERE id = ? RETURNING id, workspace_id, name, position, created_at, updated_at;

-- name: DeleteProject :execrows
DELETE FROM project WHERE id = ?;
