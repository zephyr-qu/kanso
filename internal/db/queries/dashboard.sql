-- name: ListColumnDistributions :many
-- 按列名合并（跨项目同名列聚合为一行），与前端 mock 契约一致；按计数倒序。
SELECT
    c.name AS column_name,
    COUNT(t.id) AS task_count
FROM column AS c
LEFT JOIN task AS t ON c.id = t.column_id
GROUP BY c.name
ORDER BY task_count DESC;

-- name: ListProjectColumnCounts :many
SELECT
    p.id,
    p.name,
    p.workspace_id,
    c.name AS column_name,
    c.position AS column_position,
    COUNT(t.id) AS task_count
FROM project AS p
LEFT JOIN column AS c ON p.id = c.project_id
LEFT JOIN task AS t ON c.id = t.column_id
GROUP BY p.id, c.id
ORDER BY p.created_at, c.position;

-- name: ListAllTasks :many
SELECT
    id,
    created_at
FROM task;

-- name: ListTaskCreationTrend :many
SELECT
    substr(a.created_at, 1, 10) AS day,
    COUNT(*) AS count
FROM activity AS a
WHERE a.action = 'task.created'
GROUP BY day
ORDER BY day;

-- name: ListTaskCompletionTrend :many
SELECT
    substr(a.created_at, 1, 10) AS day,
    COUNT(*) AS count
FROM activity AS a
INNER JOIN task AS t ON a.resource_id = t.id
INNER JOIN column AS c ON t.column_id = c.id
WHERE a.action = 'task.moved'
  AND json_extract(a.data, '$.from') != json_extract(a.data, '$.to')
  AND c.position = (SELECT MAX(position) FROM column WHERE project_id = c.project_id)
GROUP BY day
ORDER BY day;

-- name: ListTaskLabels :many
SELECT
    t.id,
    t.title,
    c.name AS column_name,
    l.name AS label_name
FROM task AS t
INNER JOIN task_label AS tl ON t.id = tl.task_id
INNER JOIN label AS l ON tl.label_id = l.id
INNER JOIN column AS c ON t.column_id = c.id;

-- name: ListActivitiesWithProject :many
SELECT
    a.id,
    a.action,
    a.created_at,
    p.name AS project_name
FROM activity AS a
INNER JOIN task AS t ON a.resource_id = t.id
INNER JOIN column AS c ON t.column_id = c.id
INNER JOIN project AS p ON c.project_id = p.id
WHERE a.resource_type = 'task'
ORDER BY a.created_at DESC;
