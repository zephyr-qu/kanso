-- name: ListColumnDistributions :many
-- Merge by column name across projects (frontend mock contract); count desc.
SELECT
    c.name AS column_name,
    COUNT(t.id) AS task_count
FROM column AS c
LEFT JOIN task AS t ON c.id = t.column_id AND t.archived_at IS NULL
GROUP BY c.name
ORDER BY task_count DESC;

-- name: ListPriorityDistributions :many
SELECT
    priority,
    COUNT(*) AS task_count
FROM task
WHERE archived_at IS NULL
GROUP BY priority
ORDER BY CASE priority
    WHEN 'urgent' THEN 0
    WHEN 'high' THEN 1
    WHEN 'med' THEN 2
    WHEN 'low' THEN 3
    ELSE 4
END, priority;

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
LEFT JOIN task AS t ON c.id = t.column_id AND t.archived_at IS NULL
GROUP BY p.id, c.id
ORDER BY p.created_at, c.position;

-- name: ListAllTasks :many
SELECT
    id,
    priority,
    created_at
FROM task
WHERE archived_at IS NULL;

-- name: ListFocusCandidates :many
-- focus candidates: priority=urgent or due date set. Exclude last column and cap at 8 in Go.
SELECT
    t.id,
    t.title,
    t.priority,
    t.due_date,
    c.name AS column_name,
    c.position AS column_position,
    p.id AS project_id,
    p.name AS project_name
FROM task AS t
INNER JOIN column AS c ON t.column_id = c.id
INNER JOIN project AS p ON c.project_id = p.id
WHERE
    t.archived_at IS NULL
    AND (t.priority = 'urgent' OR t.due_date IS NOT NULL)
ORDER BY t.updated_at DESC;
-- name: ListTaskCreationTrend :many
SELECT
    SUBSTR(a.created_at, 1, 10) AS day,
    COUNT(*) AS count
FROM activity AS a
WHERE a.action = 'task.created'
GROUP BY day
ORDER BY day;

-- name: ListTaskCompletionTrend :many
-- Completion trend (1/2): tasks moved into the final column, counted on move day.
-- Final column = max position (name-independent), same basis as ListProjectColumnCounts.
SELECT
    SUBSTR(a.created_at, 1, 10) AS day,
    COUNT(*) AS count
FROM activity AS a
INNER JOIN task AS t ON a.resource_id = t.id
WHERE
    a.action = 'task.moved'
    AND JSON_EXTRACT(a.data, '$.from') != JSON_EXTRACT(a.data, '$.to')
    AND JSON_EXTRACT(a.data, '$.to') IN (
        SELECT c.id
        FROM column AS c
        WHERE c.position = (
            SELECT MAX(c2.position)
            FROM column AS c2
            WHERE c2.project_id = t.project_id
        )
    )
GROUP BY day
ORDER BY day;

-- Completion trend (2/2): tasks created directly in the final column (never moved
-- into it from another column), counted on creation day. Merged with
-- ListTaskCompletionTrend to match doneTasks exactly.
-- Final column = max position (name-independent), same basis as ListProjectColumnCounts.
-- name: ListTaskCreatedInFinalColumnTrend :many
SELECT
    SUBSTR(t.created_at, 1, 10) AS day,
    COUNT(*) AS count
FROM task AS t
INNER JOIN column AS c ON t.column_id = c.id
WHERE
    c.position = (
        SELECT MAX(c2.position)
        FROM column AS c2
        WHERE c2.project_id = t.project_id
    )
    AND t.archived_at IS NULL
    AND NOT EXISTS (
        SELECT 1
        FROM activity AS a
        WHERE
            a.resource_id = t.id
            AND a.action = 'task.moved'
            AND JSON_EXTRACT(a.data, '$.from') != JSON_EXTRACT(a.data, '$.to')
            AND JSON_EXTRACT(a.data, '$.to') = t.column_id
    )
GROUP BY day
ORDER BY day;

-- name: ListActivitiesWithProject :many
SELECT
    a.id,
    a.resource_type,
    a.resource_id,
    a.project_id,
    a.workspace_id,
    a.action,
    a.data,
    a.created_at,
    a.actor,
    COALESCE(p.name, w.name, JSON_EXTRACT(a.data, '$.name'), '') AS project_name
FROM activity AS a
LEFT JOIN project AS p ON a.project_id = p.id
LEFT JOIN workspace AS w ON a.workspace_id = w.id
ORDER BY a.created_at DESC;
