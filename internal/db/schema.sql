-- 0001_init: Kanso 核心看板 schema（8 张表）
-- 单用户（admin 身份为常量，不入库）；时间戳统一 TEXT (RFC3339 UTC)，由应用层写入。

CREATE TABLE workspace (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE project (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	position INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_project_workspace ON project (workspace_id);

CREATE TABLE column (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_column_project ON column (project_id);

CREATE TABLE task (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    column_id TEXT NOT NULL REFERENCES column (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_task_project ON task (project_id);
CREATE INDEX idx_task_column ON task (column_id);

CREATE TABLE label (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_label_workspace ON label (workspace_id);

CREATE TABLE task_label (
    task_id TEXT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES label (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);
CREATE INDEX idx_task_label_task ON task_label (task_id);

CREATE TABLE comment (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_comment_task ON comment (task_id);

CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    action TEXT NOT NULL,
    data TEXT, -- JSON 字符串
    created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_resource ON activity (resource_type, resource_id);
