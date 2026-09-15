-- name: ListProjectsByWorkspace :many
SELECT id, workspace_id, name, position, created_at, updated_at, archived_at
FROM project
WHERE workspace_id = ? AND archived_at IS NULL
ORDER BY position, created_at;

-- name: ListArchivedProjectsByWorkspace :many
SELECT id, workspace_id, name, position, created_at, updated_at, archived_at
FROM project
WHERE workspace_id = ? AND archived_at IS NOT NULL
ORDER BY archived_at DESC, updated_at DESC;

-- name: GetProject :one
SELECT id, workspace_id, name, position, created_at, updated_at, archived_at FROM project WHERE id = ?;

-- name: CreateProject :one
INSERT INTO project (id, workspace_id, name, position, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING id, workspace_id, name, position, created_at, updated_at, archived_at;

-- name: UpdateProjectName :one
UPDATE project SET name = ?, updated_at = ? WHERE id = ?
RETURNING id, workspace_id, name, position, created_at, updated_at, archived_at;

-- name: ArchiveProject :one
UPDATE project SET archived_at = ?, updated_at = ?, pinned = 0 WHERE id = ?
RETURNING id, workspace_id, name, position, created_at, updated_at, archived_at;

-- Incomplete = active (not archived) and not in the final column (max position).
-- name: CountIncompleteActiveTasks :one
SELECT COUNT(*) AS count
FROM task AS t
INNER JOIN column AS c ON c.id = t.column_id
WHERE t.project_id = ?
  AND t.archived_at IS NULL
  AND c.position < (
    SELECT MAX(c2.position) FROM column AS c2 WHERE c2.project_id = t.project_id
  );

-- name: DeleteProject :execrows
DELETE FROM project WHERE id = ?;
