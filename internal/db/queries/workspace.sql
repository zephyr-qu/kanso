-- name: CountWorkspaces :one
SELECT COUNT(*) FROM workspace;

-- name: CreateWorkspace :one
INSERT INTO workspace (id, name, created_at)
VALUES (?, ?, ?)
RETURNING id, name, created_at;
