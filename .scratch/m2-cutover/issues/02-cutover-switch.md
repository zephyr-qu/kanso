# 02 — 切换开关与基础链路

**What to build:** 前端默认关闭 mock 走真实后端（`VITE_USE_MOCK=false`，mock 仅可显式开启回退）；登录 → 项目列表 → 看板（列/任务 CRUD、拖拽、排序、删除确认）在真后端下可用。Playwright E2E 改用真后端密钥跑通基础链路。

**Blocked by:** 01 — 契约预检与修偏

**Status:** done

- [x] 前端默认走真后端（mock 仅可显式开启）——`.env.development` 设 `VITE_USE_MOCK=false`；mock 仅在显式 `VITE_USE_MOCK=true` 时启用
- [x] 登录/项目列表/看板基础链路在真后端下可用（含排序与删除确认）——39 项 E2E 真后端全绿
- [x] E2E 用真后端密钥跑通基础链路；mock 开关可回退——mock 模式 3 项基础测试复验通过（8/11）
