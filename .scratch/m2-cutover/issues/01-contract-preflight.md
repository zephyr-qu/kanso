# 01 — 契约预检与修偏（mock ↔ 真实后端）

**What to build:** 真实后端跑起来后，逐一比对前端各页面依赖的接口响应与 mock 数据的形状（看板聚合、项目列表含 updatedAt、dashboard、backup、activity、label CRUD、事件文案），发现不一致就修（前端类型或后端端点），产出「mock 与真实契约一致」基线——关闭 mock 后无字段缺失导致的运行时错误。

**Blocked by:** 08 — 前端验收与对接切换（父票；本组为 08 的拆分）

**Status:** done

- [x] 逐一比对页面依赖接口的 mock 与真实响应形状（types 对齐）——dashboard 前后端共用 `computeDashboard`；项目列表 counts、activity、backup、label CRUD、事件文案已核对
- [x] 修复发现的不一致（前端类型或后端端点）——任务分布 `GROUP BY c.name` 修重复 key；种子列序 待办/进行中/已阻塞/已完成
- [x] tsc 全绿 + 契约 diff 报告——tsc 0 错误；E2E 39 项真后端全绿（8/11）
