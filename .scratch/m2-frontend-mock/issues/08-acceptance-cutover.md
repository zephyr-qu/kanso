# 08 — 前端验收与对接切换（真后端）

**What to build:** 前端验收全绿（tsc / vitest / Playwright 全部通过、新功能完整）后，切换走真实后端：`VITE_USE_MOCK=false`，全部页面走真实 API；验证 mock 与真实契约一致（updatedAt、dashboard、backup、label CRUD、排序/删除确认/标签库/活动页在真后端下可用）；Playwright E2E 改用真后端密钥跑通全链路（登录 → 项目列表 → 看板 → 详情 → 仪表盘 → 设置备份 → 标签 → 活动）。双浏览器双窗口验证 WebSocket 实时同步（新增/移动任务互相同步、项目隔离）。mock 代码保留可回退（`VITE_USE_MOCK=true`），默认走真后端。

**Blocked by:** 05 — 乐观更新回归测试, 06 — 后端：dashboard / backup 端点 + project.updated_at, 07 — 前端视觉对齐收尾

**Status:** ready-for-agent

- [ ] 前端默认走真后端（mock 仅可显式开启）
- [ ] 全页面在真后端下功能可用（含 dashboard/settings/标签库/活动页/排序/删除确认）
- [ ] mock 与真实契约一致：无字段缺失导致的运行时错误
- [ ] E2E 用真后端密钥全绿；mock 开关验证可回退
- [ ] 双窗口 WebSocket 实时验证通过（同步 + 项目隔离）
