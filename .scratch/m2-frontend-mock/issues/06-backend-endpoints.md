# 06 — 后端：dashboard / backup / activity 端点 + project.updated_at

**What to build:** 后端补齐四个对接所需的能力，全部对齐前端 mock 已定义的契约：

- `GET /api/dashboard`：统计卡（总数/待办/进行中/紧急/本周新增/已完成）、完成率、按列分布、按标签分布、项目速览（done/total）、需要关注（紧急）、最近活动——批量聚合查询，避免逐项目 N+1
- `GET /api/settings/backup`：导出全量数据 JSON 快照（工作区/项目/列/任务/标签/关联/评论/活动 + 导出时间），只导出不提供恢复
- `GET /api/activity`：全局活动流（活动页数据源，拍平全部任务活动 + 项目名），与仪表盘最近活动共用数据源
- project 表新增 `updated_at` 列（迁移 + 生成代码 + 创建/重命名写入 + 列表接口返回 `updatedAt`）

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `/api/dashboard` 响应形状与前端契约完全一致（关闭 mock 后直接可用）
- [x] `/api/settings/backup` 导出完整快照，前端备份下载按钮可直接消费
- [x] `/api/activity` 返回拍平活动流（projectName/action/createdAt），活动页直接可用
- [x] project 迁移加列不破坏既有数据；创建/重命名写入正确；列表返回 `updatedAt`（ISO8601 UTC）
- [x] 后端测试覆盖四处（dashboard 形状、backup 完整性、activity 形状、project.updatedAt 合约）
- [x] 后端测试全绿（沿用现有 HTTP 合约测试缝）

## 实现提示（已验证）

- **SQL 查询中不得出现中文字符串常量**：sqlc（modernc sqlite 解析器）遇到 SQL 里的中文（如 `WHERE name = '紧急'`）会截断后续语句导致生成代码残缺。需要中文匹配时改为 Go 层过滤（如先取全量标签/列名再做相等判断）。
- 查询文件避免以中文注释作为文件头（sqlc 曾报 missing query type）。
