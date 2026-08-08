# Review (SPEC axis)

## Correct (verified)
- Test seam matches spec: `router_test.go` mounts real chi router via `httptest.NewServer`, temp-dir real SQLite, real migrations + seed; 20 tests pass (`go test ./...`), `go vet`/`tsc --noEmit` clean.
- Spec REST routes present: workspaces/projects/columns/tasks/labels/comments (`router.go:28-51`); auth 401, WS project isolation, task move/reorder reindex (`service/task.go:86-170`), MAX+1 allocation (`task.sql:15`), default columns 待办/进行中/已完成 position 0/1/2 (`service/project.go:36`), comment-is-activity (`service/comment.go:53`), labels at workspace level, cascade FKs (`0001_init.sql`), routes `/login /w/:id /w/:id/p/:pid /w/:id/p/:pid/t/:tid` (`App.tsx`), optimistic update + invalidate rollback (`board.tsx:408-487`).

## (a) Missing / partial
- **Partial — activity never cascade-deleted** (spec: "activity 随其归属实体删除，不保留孤儿记录"; "当活动因任务/项目删除而失去归属时，活动随上级级联删除"). `activity` has no FK (`0001_init.sql:59-66`) and no `DELETE FROM activity` exists anywhere; `DeleteTask/Column/Project/Workspace` only delete own rows. Orphans persist. The spec's 必测 "删 workspace 后…活动全部消失" is only asserted for project/column counts (`router_test.go:158-204`).
- **Missing — batch reorder endpoint** (spec: "另设任务顺序批量提交端点供整列重排"). No such route; whole-column reorder only via per-task `PATCH /api/tasks/:id`.
- **Partial — `GET /api/tasks/:id/activity`** (spec contract: "activity：`GET /api/tasks/:id/activity`"). Route absent; activity only embedded in detail aggregate.
- **Partial (frontend) — reconnect re-fetch** (spec Realtime 3: "重连后重新拉取最新数据"). `use-realtime.ts` reconnects every 2s but invalidates only on messages, never on (re)connect.

## (b) Scope creep
- None significant. Minor: `GET /api/tasks/:id` detail aggregate is an extra endpoint not in the contract (substitutes the missing activity endpoint).

## (c) Implemented but looks wrong
- **WS auth via query param, not Bearer** (spec: "握手时校验 Bearer Key") — key leaks into URLs/logs; pragmatic for browsers, but contract deviation.
- **WS `OriginPatterns` only `localhost`/`127.0.0.1`** (`ws.go:31`) — intranet LAN access (`http://192.168.x.x`) gets rejected; realtime breaks for non-local clients.
- **MAX+1 create is non-transactional** (`task.sql:15` + `service/task.go:18-34`): read-MAX then insert outside a transaction — concurrent creates can share a position.
- **Comment author not displayed** (`task-detail.tsx:236-250` shows time only; spec: "看到每条评论的作者（Admin Identity）与时间").

**Residual risks:** activity orphans violate data hygiene; LAN-origin WS rejection; comment verb `"comment.created"` vs spec `verb=comment`.