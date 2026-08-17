-- name: CountMembersByWorkspace :one
SELECT COUNT(*) FROM member WHERE workspace_id = ?;

-- name: ListMembersByWorkspace :many
SELECT * FROM member WHERE workspace_id = ? ORDER BY created_at, id;

-- name: GetMember :one
SELECT * FROM member WHERE id = ?;

-- name: GetOwnerMember :one
SELECT * FROM member WHERE role = 'owner' ORDER BY created_at LIMIT 1;

-- name: GetMemberByAccessKey :one
SELECT * FROM member WHERE access_key = ?;

-- name: CreateMember :one
INSERT INTO member (id, workspace_id, name, role, avatar_color, avatar, access_key, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateMemberProfile :one
UPDATE member SET name = ?, avatar_color = ?, avatar = ? WHERE id = ? RETURNING *;

-- name: UpdateMemberAccessKey :one
UPDATE member SET access_key = ? WHERE id = ? RETURNING *;

-- name: DeleteMember :execrows
DELETE FROM member WHERE id = ?;
