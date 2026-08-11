-- name: ListAllProjects :many
SELECT * FROM project
ORDER BY created_at;

-- name: ListAllColumns :many
SELECT * FROM column
ORDER BY position;

-- name: ListAllTasksFull :many
SELECT * FROM task
ORDER BY created_at;

-- name: ListAllLabels :many
SELECT * FROM label
ORDER BY created_at;

-- name: ListAllTaskLabels :many
SELECT
    task_id,
    label_id
FROM task_label;

-- name: ListAllComments :many
SELECT * FROM comment
ORDER BY created_at;

-- name: ListAllActivities :many
SELECT * FROM activity
ORDER BY created_at;
