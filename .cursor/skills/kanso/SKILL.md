---
name: kanso
description: >-
  Operate a running Kanso kanban instance (workspaces, projects, boards, tasks,
  labels, milestones) via MCP tools or the kanso CLI. Use when the user mentions
  Kanso, kanban boards, tasks/labels/milestones on Kanso, kanso mcp, or kanso
  CLI client commands.
---

# Kanso board agent

## Prefer MCP

If the `kanso` MCP server is configured, call its tools (`kanso_health`, `kanso_show_board`, `kanso_create_task`, `kanso_label`, `kanso_milestone`, …).

If MCP is unavailable, run `kanso --json …` instead. Command surface: [tutorial/cli/README.md](../../../tutorial/cli/README.md).

## Auth

1. Start with `kanso_health` / `kanso_whoami` (or CLI equivalents).
2. On auth failure, tell the user to run `kanso login --key <access-key>` or set `KANSO_ACCESS_KEY` / `--key`. Do not invent keys.

Auth resolution: `--key` > `KANSO_ACCESS_KEY` > `~/.config/kanso/cli.json`. API base: `--addr` / `KANSO_API_URL` (default `http://127.0.0.1:8080`).

## IDs

Before create/update/move/attach/delete, resolve real IDs with list/board/get tools. Never invent UUIDs.

## Out of scope

Do **not** use MCP/CLI for: member management, backup, settings, or starting the HTTP server (`kanso serve` is operator-only, not an agent tool).

## Destructive actions

Confirm with the user before `delete` or `archive` (task or project).

Project archive requires no active incomplete tasks (not archived and not in the final column). Archived projects are read-only until restored.
