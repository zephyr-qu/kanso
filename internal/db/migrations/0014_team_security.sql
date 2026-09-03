-- 0014_team_security: replace plaintext member credentials with one-way hashes.
-- Existing member keys are intentionally invalidated; the owner key is reseeded
-- from KANSO_ACCESS_KEY during application startup.
CREATE TABLE member_v040 (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    avatar_color TEXT,
    avatar TEXT,
    access_key_hash TEXT UNIQUE,
    created_at TEXT NOT NULL
);

INSERT INTO member_v040 (id, workspace_id, name, role, avatar_color, avatar, access_key_hash, created_at)
SELECT id, workspace_id, name, role, avatar_color, avatar, NULL, created_at
FROM member;

DROP TABLE member;
ALTER TABLE member_v040 RENAME TO member;
CREATE INDEX idx_member_workspace ON member (workspace_id);
CREATE UNIQUE INDEX idx_member_single_owner ON member (role) WHERE role = 'owner';
