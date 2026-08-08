# 05 — 任务创建与看板内编辑

**What to build:** 用户可在任意列底部添加任务（输入标题即创建），任务卡片显示标题；卡片上可编辑标题、删除任务（确认）。服务端为新建任务分配正确的列内 position，删除后其余任务 position 收敛。API 缝测试覆盖任务 CRUD 与 position 分配。

**Blocked by:** 04 — 看板与列管理

**Status:** ready-for-agent

- [ ] 任意列底部添加任务成功并出现在该列末尾
- [ ] 卡片内编辑任务标题生效
- [ ] 删除任务需确认，删除后同列其余任务顺序收敛
- [ ] API 缝测试：任务 CRUD 全链路、新建 position 分配、删除后 reindex
