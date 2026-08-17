-- name: ListTasksByProject :many
SELECT * FROM task WHERE project_id = ? AND archived_at IS NULL ORDER BY position, created_at;

-- name: ListTasksByColumn :many
SELECT * FROM task WHERE column_id = ? AND archived_at IS NULL ORDER BY position, created_at;

-- name: GetTask :one
SELECT * FROM task WHERE id = ?;

-- name: ArchiveTask :one
UPDATE task SET archived_at = ?, updated_at = ? WHERE id = ?
RETURNING *;

-- name: ListArchivedTasksByProject :many
SELECT * FROM task WHERE project_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC, updated_at DESC;

-- name: MaxTaskPositionByColumn :one
SELECT COALESCE(MAX(position), -1) + 1 FROM task WHERE column_id = ?;

-- name: CreateTask :one
INSERT INTO task (id, project_id, column_id, title, description, position, priority, due_date, archived_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
RETURNING *;

-- name: UpdateTask :one
UPDATE task SET title = ?, description = ?, priority = ?, due_date = ?, updated_at = ? WHERE id = ? RETURNING *;

-- name: SetTaskPosition :exec
UPDATE task SET column_id = ?, position = ?, updated_at = ? WHERE id = ?;

-- name: DeleteTask :execrows
DELETE FROM task WHERE id = ?;

-- name: SearchTasks :many
-- Global search (command palette): title/description/comment substring match with project info.
SELECT
    t.id,
    t.title,
    t.column_id,
    t.priority,
    t.due_date,
    p.id AS project_id,
    p.name AS project_name,
    p.workspace_id,
    w.name AS workspace_name
FROM task AS t
INNER JOIN column AS c ON t.column_id = c.id
INNER JOIN project AS p ON c.project_id = p.id
INNER JOIN workspace AS w ON p.workspace_id = w.id
WHERE (
    t.title LIKE '%' || ? || '%'
    OR COALESCE(t.description, '') LIKE '%' || ? || '%'
    OR EXISTS (
        SELECT 1
        FROM comment AS cm
        WHERE cm.task_id = t.id
          AND cm.content LIKE '%' || ? || '%'
    )
)
ORDER BY t.updated_at DESC
LIMIT 20;

