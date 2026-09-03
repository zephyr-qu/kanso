-- 0015_workspace_membership: 将成员从单一工作区归属升级为全局身份 + 工作区授权。
-- 开发版本不保留旧 member.workspace_id 字段，但迁移当前数据库中的身份资料。
CREATE TABLE member_v2 (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    avatar_color TEXT,
    avatar TEXT,
    access_key_hash TEXT UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE member_legacy_workspace (
    member_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

INSERT INTO member_legacy_workspace (member_id, workspace_id, created_at)
SELECT id, workspace_id, created_at FROM member;

INSERT INTO member_v2 (id, name, role, avatar_color, avatar, access_key_hash, created_at)
SELECT id, name, CASE WHEN role = 'owner' THEN 'admin' ELSE role END,
       avatar_color, avatar, access_key_hash, created_at
FROM member;

DROP TABLE member;
ALTER TABLE member_v2 RENAME TO member;

CREATE TABLE workspace_member (
    workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES member (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, member_id)
);

CREATE INDEX idx_workspace_member_member ON workspace_member (member_id, workspace_id);

INSERT INTO workspace_member (workspace_id, member_id, created_at)
SELECT workspace_id, member_id, created_at FROM member_legacy_workspace;

DROP TABLE member_legacy_workspace;
