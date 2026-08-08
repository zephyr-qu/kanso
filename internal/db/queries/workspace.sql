-- name: CountWorkspaces :one
SELECT COUNT(*) FROM workspace;

-- name: ListWorkspaces :many
SELECT * FROM workspace ORDER BY created_at;

-- name: GetWorkspace :one
SELECT * FROM workspace WHERE id = ?;

-- name: CreateWorkspace :one
INSERT INTO workspace (id, name, created_at)
VALUES (?, ?, ?)
RETURNING id, name, created_at;

-- name: UpdateWorkspaceName :one
UPDATE workspace SET name = ? WHERE id = ? RETURNING id, name, created_at;

-- name: DeleteWorkspace :execrows
DELETE FROM workspace WHERE id = ?;
