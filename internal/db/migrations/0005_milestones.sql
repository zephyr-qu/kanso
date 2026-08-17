-- 0005_milestones: 项目里程碑与任务关联。
CREATE TABLE milestone (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    due_date TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_milestone_project ON milestone (project_id);

CREATE TABLE task_milestone (
    task_id TEXT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    milestone_id TEXT NOT NULL REFERENCES milestone (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, milestone_id)
);
CREATE INDEX idx_task_milestone_milestone ON task_milestone (milestone_id);
