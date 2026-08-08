# Task for reviewer

You are reviewing the M1 implementation of the Kanso kanban project at F:/golang/kanso (Go backend + React frontend). Repo root: F:/golang/kanso.

Fixed point: commit 727ad12 (M0 baseline). Review the diff: git diff 727ad12...HEAD (run it in F:/golang/kanso). Commits: git log 727ad12..HEAD --oneline.

Your axis: SPEC. The originating spec is docs/specs/0001-m1-core-board.md — READ IT FULLY. It defines: the M1 core-board MVP (workspace/project/column/task with drag ordering/label/comment/activity/WebSocket realtime), the REST API contract, the single HTTP API test seam (httptest against real router + temp-dir real SQLite, external behavior only), cascade deletes, MAX-position task allocation, labels at workspace level, comment-is-activity, and per-project WS subscription.

Also skim the ticket files in .scratch/m1-core-board/issues/01-09-*.md (each ticket's acceptance criteria).

Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words.

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