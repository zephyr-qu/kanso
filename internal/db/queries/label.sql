-- name: ListLabelsByWorkspace :many
SELECT * FROM label WHERE workspace_id = ? ORDER BY created_at;
