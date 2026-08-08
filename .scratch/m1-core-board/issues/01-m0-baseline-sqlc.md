# 01 — M0 收尾与 sqlc 铺底

**What to build:** 让仓库处于可构建、可启动、可测试的基线：后端依赖完整（chi、modernc.org/sqlite），迁移能真实执行（当前嵌入目录遍历有 bug，会静默跳过所有迁移），路由接收数据库句柄，sqlc 按现有 schema 生成代码并接入数据访问层，默认工作区种子生效。此基线成为后续所有切片的起点。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `go build ./...` 与 `go vet ./...` 全绿
- [ ] 启动后迁移真实生效：8 张核心表存在，schema_migrations 正确记录
- [ ] 首启自动种子默认工作区成功，健康检查与密钥验证端点可用
- [ ] sqlc 生成代码可编译并被 workspace 数据访问使用
- [ ] 以当前基线（含 spec 与 tickets）创建仓库首个 git 提交

**Note:** 依赖补齐、迁移 bug 修复、router 签名已在 spec 产出过程中完成，本 ticket 验收时可跳过或复核。
