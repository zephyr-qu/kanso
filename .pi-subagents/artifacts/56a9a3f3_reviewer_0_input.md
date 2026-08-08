# Task for reviewer

Review the M1 implementation of the Kanso kanban project at F:/golang/kanso (Go backend + React frontend). Repo root: F:/golang/kanso.

Fixed point: commit 727ad12 (M0 baseline). Run `git diff 727ad12...HEAD` and `git log 727ad12..HEAD --oneline` in F:/golang/kanso.

Your axis: STANDARDS. Two sources:
(1) Documented repo standards — there is NO CODING_STANDARDS.md. Binding conventions to check against: docs/adr/0004-tech-stack.md (chi router, modernc.org/sqlite, sqlc generated code for data access, coder/websocket, React 19 + Vite + TypeScript + Tailwind v4 + dnd-kit + TanStack Query + zustand + react-router v7) and CONTEXT.md domain vocabulary (Workspace/Project/Board/Column/Task/Label/Comment/Activity/Access Key/Admin Identity). Verify the code actually follows the chosen stack (sqlc for data access, chi handlers, domain vocabulary in identifiers/comments).
(2) Fowler smell baseline (repo standards override; each smell is a labelled judgement call, never a hard violation; skip anything tooling enforces):
- Mysterious Name — name doesn't reveal what it does/holds → rename
- Duplicated Code — same logic shape in multiple hunks/files → extract shared shape
- Feature Envy — method reaches into another object's data more than its own → move onto that data
- Data Clumps — same few fields/params travel together → bundle into a type
- Primitive Obsession — primitive standing in for a domain concept → give it a type
- Repeated Switches — same switch/if-cascade on same type recurs → polymorphism or shared map
- Shotgun Surgery — one logical change forces scattered edits → gather into one module
- Divergent Change — one module edited for several unrelated reasons → split
- Speculative Generality — abstraction/params/hooks for needs the spec doesn't have → delete
- Message Chains — long a.b().c().d() navigation → hide behind one method
- Middle Man — class/function that mostly delegates → cut it
- Refused Bequest — implementer ignores most of what it inherits → composition

Report — per file/hunk where relevant: (a) every place the diff violates a documented standard (cite the source file + rule); (b) any baseline smell you spot (name it + quote the hunk). Distinguish hard violations from judgement calls. Skip anything tooling enforces. Under 400 words.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```