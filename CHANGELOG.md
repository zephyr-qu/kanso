# Changelog

## 未发布

认证限流口径修正（修正 0.5.0 中「WebSocket 握手与 Bearer 失败按同一 IP 令牌桶限流」的口径）：

- `/api/ws` 不再挂全局限流中间件：WebSocket 握手仅在**密钥查找失败**时消耗 IP 令牌桶（与 Bearer 失败同桶），成功握手不占额度。此前成功握手也扣额度，与「成功认证不消耗额度」矛盾——断线重连（前端 `onclose` 后 2s 重试）与多标签页会持续打满 burst（10）并被 429 拒绝，E2E 日志实测同秒 `/api/ws` 429。
- 回归测试：`TestWSHandshakeSuccessDoesNotConsumeRateLimit`（连续 2×burst 次成功握手不被限流）、`TestWSHandshakeFailureConsumesRateLimit`（burst 次 401 后 429，带 `Retry-After: 1`）。

## 0.5.0 - 2026-09-29

项目归档：

- 项目支持软归档 / 恢复（`archived_at`）；默认列表只显示活跃项目
- 归档前须无未完成活跃任务（未归档且不在末列）；归档后看板只读，禁止改任务/列/标签等
- API：`POST /api/projects/{id}/archive|restore`，`GET /api/workspaces/{id}/archived-projects`
- CLI：`project archive|restore|archived`；MCP：`kanso_archive_project` / `kanso_restore_project` / `kanso_list_archived_projects`
- 工作区页「已归档」入口；看板归档态提示与恢复

AI 捕获：

- Quick Capture 增加 **AI** 页签：粘贴文本 → 服务端调用 OpenAI 兼容 Chat Completions → 预览编辑后批量创建任务
- 设置页「AI 捕获」：Base URL / Model / API Key（密钥不回传；空 key 表示保持原值）
- 配置项：`aiBaseURL` / `aiAPIKey` / `aiModel`（写入 `kanso-config.json`）；环境变量 `KANSO_AI_BASE_URL` / `KANSO_AI_API_KEY` / `KANSO_AI_MODEL` 优先于文件
- `POST /api/workspaces/{id}/ai-capture/analyze`（需编辑内容权限）；创建仍走既有 `POST /api/columns/{id}/tasks`

结构化日志与认证限流：

- 进程日志改为 `log/slog`（请求带 `request_id` / `method` / `uri`，密钥查询参数脱敏；错误带 `request_id` 与状态）
- panic 由 slog Recoverer 记录 `request_id` / `method` / `uri` / `panic` / `stack`，响应 500，不再走 chi 默认 `log`
- `KANSO_LOG_FORMAT=json|text`、`KANSO_LOG_LEVEL=debug|info|warn|error`
- `/api/auth/verify`、WebSocket 握手与 Bearer 失败按同一 IP 令牌桶限流（超限 429）；Bearer 成功不消耗额度

命令行统一到单一 `kanso` 二进制：

- 启动服务改为显式子命令：`kanso serve`（裸跑 `kanso` 不再启动 HTTP）
- 同二进制提供 HTTP 客户端：`health` / `login` / `whoami` / `workspace` / `project` / `board` / `task` / `label` / `milestone`
- `kanso mcp`：stdio MCP（官方 go-sdk），工具复用同一 HTTP Client；项目 Skill `.cursor/skills/kanso`
- 任务支持 update、archive/restore、archived 列表与 delete；标签与里程碑支持 CRUD 及与任务的关联
- 移除独立 `kansoctl`；Docker `ENTRYPOINT` 改为 `["/app/kanso", "serve"]`
- 入门教程见 [tutorial/cli](tutorial/cli/README.md)

**升级注意**：

- 本地脚本、Compose 外的手工启动、以及文档中的 `go run ./cmd/kanso` / `./kanso` 需改为带 `serve`（统一 `kanso` CLI）。
- 首次启动自动执行 0015–0017 迁移：成员由「单一工作区归属」改为全局身份 + `workspace_member` 授权，新增项目归档字段。

## 0.4.0 - 2026-09-09

团队安全与权限完善：

- 新增统一 Capability 授权与 admin/member 权限矩阵
- 成员访问密钥改为哈希存储，支持显式轮换、撤销与管理员原子转移（`POST /api/members/{id}/transfer-admin`，事务内互换角色；团队页提供入口）
- 新增团队设置页，个人资料页移除团队成员管理
- 补充 0014 数据库迁移、Mock/API 契约和团队领域记录
- 里程碑进度口径调整：归档的已完成任务继续计入进度（归档不改列位置，进度不回退）
- 看板与任务详情视图拆分、工作区上下文语义收口、侧边栏项目图标更新

**升级注意**：

- 0014 迁移会作废全部既有成员密钥（仅管理员密钥按 `KANSO_ACCESS_KEY` 自动重种）；升级后请为各成员重新生成访问密钥

## 0.3.0 - 2026-08-21

自动归档、服务配置收敛与交付稳定性：

- 自动归档：完成列任务按保留天数定期归档，默认开启，可在配置文件中关闭
- 服务配置：移除设置页访问密钥编辑，补充 WebSocket 跨域白名单说明
- 看板交互与备份恢复流程加固，补充后端、前端和 Playwright 验收覆盖
- CI 拆分常规检查与 E2E 流程，支持按版本 tag 构建并发布容器镜像

## 0.2.0 - 2026-08-19

里程碑与分享、项目置顶、UI 与架构统一：

- 里程碑：管理弹层 CRUD、项目进度卡、详情面板（查看/解绑关联任务）
- 里程碑-任务多对多关联：长按拖线、点卡进详情、删除/分享内联确认
- 里程碑进度分享卡（旅程曲线版 + 导出 PNG）
- 项目置顶：侧边栏「置顶」分组直达任务页，跨设备持久化
- 移除四象限模板，优先级统一为 urgent/high/med/low
- 看板拖拽模块深化（reducer 统一放置索引数学）、里程碑进度工具与组件去重（架构重构）

## 0.1.0 - 2026-08-17

首个可发布基线版本，包含：

- 工作区、项目、列、任务和标签管理
- 拖拽排序、跨列移动与 WebSocket 实时同步
- 仪表盘、活动流、任务详情和评论
- 日历、Quick Capture、命令面板、归档、优先级、截止日期和里程碑
- personal/team 双模式与成员管理
- SQLite 数据迁移、备份导出与全量恢复
- 前端类型检查、单元测试、生产构建和 Playwright E2E 验收
