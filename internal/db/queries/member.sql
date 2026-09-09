-- name: CountMembersByWorkspace :one
SELECT COUNT(*) FROM workspace_member WHERE workspace_id = ?;

-- name: CountMembers :one
SELECT COUNT(*) FROM member;

-- name: ListMembersByWorkspace :many
SELECT m.id, m.name, m.role, m.avatar_color, m.avatar, m.access_key_hash, m.created_at
FROM member m
WHERE m.role = 'admin'
   OR EXISTS (SELECT 1 FROM workspace_member wm WHERE wm.workspace_id = ? AND wm.member_id = m.id)
ORDER BY m.created_at, m.id;

-- name: GetMember :one
SELECT * FROM member WHERE id = ?;

-- name: GetAdminMember :one
SELECT id, name, role, avatar_color, avatar, access_key_hash, created_at FROM member WHERE role = 'admin' ORDER BY created_at LIMIT 1;

-- name: GetMemberByAccessKey :one
SELECT * FROM member WHERE access_key_hash = ?;

-- name: CreateMember :one
INSERT INTO member (id, name, role, avatar_color, avatar, access_key_hash, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING id, name, role, avatar_color, avatar, access_key_hash, created_at;

-- name: UpdateMemberProfile :one
UPDATE member SET name = ?, avatar_color = ?, avatar = ? WHERE id = ? RETURNING *;

-- name: UpdateMemberAccessKey :one
UPDATE member SET access_key_hash = ? WHERE id = ? RETURNING *;

-- name: ClearMemberAccessKey :execrows
UPDATE member SET access_key_hash = NULL WHERE id = ?;

-- name: UpdateMemberRole :execrows
UPDATE member SET role = ? WHERE id = ?;

-- name: DeleteMember :execrows
DELETE FROM member WHERE id = ?;
