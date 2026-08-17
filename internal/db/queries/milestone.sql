-- name: ListMilestonesByProject :many
SELECT * FROM milestone WHERE project_id = ? ORDER BY created_at;

-- name: GetMilestone :one
SELECT * FROM milestone WHERE id = ?;

-- name: CreateMilestone :one
INSERT INTO milestone (id, project_id, name, due_date, created_at)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateMilestone :one
UPDATE milestone SET name = ?, due_date = ? WHERE id = ? RETURNING *;

-- name: DeleteMilestone :execrows
DELETE FROM milestone WHERE id = ?;

-- name: ListMilestoneProgress :many
-- milestone progress: linked tasks total / done = unarchived in last column.
SELECT
    m.id AS milestone_id,
    CAST(COALESCE(COUNT(tm.task_id), 0) AS INTEGER) AS total,
    CAST(COALESCE(SUM(CASE WHEN t.archived_at IS NULL AND c.position = (
        SELECT MAX(position) FROM column WHERE project_id = c.project_id
    ) THEN 1 ELSE 0 END), 0) AS INTEGER) AS done
FROM milestone m
LEFT JOIN task_milestone tm ON tm.milestone_id = m.id
LEFT JOIN task t ON t.id = tm.task_id
LEFT JOIN column c ON t.column_id = c.id
WHERE m.project_id = ?
GROUP BY m.id;
-- name: AttachTaskMilestone :execrows
INSERT OR IGNORE INTO task_milestone (task_id, milestone_id) VALUES (?, ?);

-- name: DetachTaskMilestone :execrows
DELETE FROM task_milestone WHERE task_id = ? AND milestone_id = ?;
