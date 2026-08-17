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
    wip_limit INTEGER,
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
    priority TEXT NOT NULL DEFAULT 'med',
    due_date TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_task_project ON task (project_id);
CREATE INDEX idx_task_column ON task (column_id);

CREATE TABLE label (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_label_project ON label (project_id);

CREATE TABLE task_label (
    task_id TEXT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES label (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);
CREATE INDEX idx_task_label_task ON task_label (task_id);

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

CREATE TABLE comment (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'Admin' -- 归属身份（ADR-0013：personal 'Admin'，team 成员名）
);
CREATE INDEX idx_comment_task ON comment (task_id);

CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    action TEXT NOT NULL,
    data TEXT, -- JSON 字符串
    created_at TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'Admin' -- 归属身份（ADR-0013：personal 'Admin'，team 成员名）
);
CREATE INDEX idx_activity_resource ON activity (resource_type, resource_id);

-- 0007: 成员（轻量 1-3 人小团队；owner/member 两级角色，多密钥认证）
CREATE TABLE member (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
    avatar_color TEXT,                   -- 头像底色（前端色板值）
    avatar TEXT,                         -- 上传头像（data URL）
    access_key TEXT UNIQUE,              -- 访问密钥（授权后生成；owner 由启动种子注入）
    created_at TEXT NOT NULL
);
CREATE INDEX idx_member_workspace ON member (workspace_id);
