# ADR-0004: 技术栈选型

Status: accepted

后端（用户逐项拍板）：

- HTTP：**chi**（标准库原生 Handler、中间件透明；gin 对比后弃用——框架概念多、收益对自用小项目无感）
- SQLite：**modernc.org/sqlite**（纯 Go 无 CGO，Docker alpine 直接跑、交叉编译友好；弃 mattn/go-sqlite3 的 CGO 负担）
- 数据访问：**sqlc**（SQL 文件生成类型安全代码，配合 database/sql；弃 GORM/手写 SQL）
- 实时：**coder/websocket**（WebSocket hub，按项目/任务广播）
- 迁移：手写 SQL 迁移文件 + 启动时自动执行

前端（薄前端理念）：

- **React 19 + Vite + TypeScript + Tailwind v4 + dnd-kit + coss ui**（Base UI 底层，registry 按需拉组件）
- **Zustand** 管全局 UI 状态（当前项目/任务、侧边栏等）；局部状态用组件 useState
- **TanStack Query** 管服务端数据（缓存/失效/重试 + 拖拽乐观更新，配 WS 推送 invalidate 失效）
- **react-router v7**（library 模式）：`/login`、`/w/:id`、`/w/:id/p/:pid`（看板）、`/w/:id/p/:pid/t/:tid`（任务详情）；刷新保持/前进后退/链接直达

Consequences:

- 前后端无共享类型包：前端自行定义 API 类型（手写 fetch 封装 + TS 类型）
- 部署链完全无 Node：前端构建产物内嵌进 Go 二进制
