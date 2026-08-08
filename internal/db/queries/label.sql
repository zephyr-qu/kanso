-- name: ListLabelsByWorkspace :many
SELECT * FROM label WHERE workspace_id = ? ORDER BY created_at;

-- name: GetLabel :one
SELECT * FROM label WHERE id = ?;

-- name: CreateLabel :one
INSERT INTO label (id, workspace_id, name, color, created_at)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateLabel :one
UPDATE label SET name = ?, color = ? WHERE id = ? RETURNING *;

-- name: DeleteLabel :execrows
DELETE FROM label WHERE id = ?;

-- name: ListTaskLabelsByProject :many
SELECT tl.task_id, l.* FROM task_label tl
JOIN label l ON l.id = tl.label_id
WHERE tl.task_id IN (SELECT id FROM task WHERE project_id = ?);

-- name: AttachLabel :exec
INSERT OR IGNORE INTO task_label (task_id, label_id) VALUES (?, ?);

-- name: DetachLabel :exec
DELETE FROM task_label WHERE task_id = ? AND label_id = ?;
