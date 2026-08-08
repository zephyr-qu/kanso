All checks complete. Compiling the review.

## Review

**Documented standards (hard checks, ADR-0004 + CONTEXT.md) — all satisfied:**
- **chi router** — `internal/httpapi/router.go` uses `chi.NewRouter()`, `chi.URLParam`, chi middleware. ✓
- **sqlc data access** — every service method goes through `gen.New(s.db)` / `gen.New(tx)` (`internal/service/*.go`); `sqlc.yaml` adds `emit_pointers_for_null_types` (needed for the `*string` description contract). ✓
- **coder/websocket** — `internal/httpapi/ws.go` uses `websocket.Accept` with `OriginPatterns`. ✓
- **Frontend stack** — `web/src/pages/board.tsx` imports dnd-kit, TanStack Query, react-router v7; `store/auth.ts` uses zustand. ✓
- **Domain vocabulary** — all identifiers/paths follow CONTEXT.md: Workspace/Project/Column/Task/Label/Comment/Activity; router paths `/api/workspaces|projects|columns|tasks|labels|comments`; no avoid-terms (组织/板块/工单) found. ✓
- **Verification**: `go build`/`go vet` clean; `go test ./...` 20 passed / 10 packages; `tsc --noEmit` clean (no frontend test suite exists — API-seam tests live in `internal/httpapi/router_test.go`, +786 lines).

**Fowler smells (labelled judgement calls, no hard violations):**
- **Duplicated Code (mild)** — identical not-found delete shape `GetX → DeleteX → if n == 0 { return ErrNotFound }` recurs in 6 files: `column.go:163`, `comment.go:71`, `label.go:78`, `project.go:94`, `task.go:90`, `workspace.go:85`. A shared helper (mirroring `mapNoRows`) would unify; 3 lines each, acceptable.
- **Primitive Obsession (mild)** — event types as raw strings ("task.created"/"label.attached") are duplicated between Go `emit` calls and frontend `ACTION_LABELS` (`task-detail.tsx:24-31`); a typo silently breaks activity labels. Mitigated by ADR-0004's explicit "前后端无共享类型包".
- **Divergent Change (mild)** — `board.tsx` at 661 lines mixes column CRUD + task CRUD + label manager + dnd drag logic + 10 mutations; page-component convention, watch the boundary.
- **Inconsistency note** — `toggleLabel` (`board.tsx:210`) uses raw `api().then().catch()` while the other 9 mutations use `useMutation`.
- **Not present**: Feature Envy, Middle Man, Repeated Switches (ACTION_LABELS map instead), Message Chains, Refused Bequest, Speculative Generality (Broadcaster interface is a justified test seam).

**Blocker**: none. **Hard violations**: none found.