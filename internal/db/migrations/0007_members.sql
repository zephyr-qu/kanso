-- 0007_members: 成员与多密钥认证（0006 规划 Phase 1）
-- 角色两级：owner（工作区所有者，不可删除）/ member（普通成员）。
-- access_key 由管理员授权生成（POST /api/members/{id}/key）；owner 的密钥由启动种子注入（KANSO_ACCESS_KEY）。
CREATE TABLE member (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
    avatar_color TEXT,                   -- 头像底色（前端色板值）
    avatar TEXT,                         -- 上传头像（data URL）
    access_key TEXT UNIQUE,              -- 访问密钥；未授权为 NULL
    created_at TEXT NOT NULL
);
CREATE INDEX idx_member_workspace ON member (workspace_id);
