# M2 Cutover 交付报告（2026-08-11）

## 结论

M2 对接（mock → 真后端）完成：全部 5 张票 done，全量测试真后端模式全绿。

## 验证矩阵

| 层 | 命令 | 结果 |
| --- | --- | --- |
| Go 后端测试 | `go test ./...` | 49 通过（11 包） |
| 前端类型 | `tsc --noEmit` | 0 错误 |
| 前端单测 | `npx vitest run` | 43 通过 |
| E2E（真后端） | `npx playwright test` | 39 通过（71s） |
| 视觉对比 | `playwright test visual-compare` | 8 通过 |
| mock 回退 | 3 项基础测试（5199 端口 mock 模式） | 通过 |

## 本批完成的工作

1. **契约预检收尾（票 01）**：任务分布 `GROUP BY c.name` 修重复 key、种子列序调整早已应用；dashboard 前后端共用 `computeDashboard` 形状天然一致；tsc 0 错误。
2. **E2E 真后端化（票 02 核心）**：新增 `web/e2e/seed.ts` —— 每个测试前通过 API 重置共享库并重建命名种子（原型演示/看板冒烟/标签冒烟 + 前端/紧急/设计标签），复现 mock 模式下「每测试独立数据」语义；12 个既有 spec 全部加 `beforeEach` 重置；seed 检测 `VITE_USE_MOCK=true` 时跳过（mock 回退仍可用）。
3. **新功能页真后端验证（票 03）**：dashboard 统计数值与种子一致（totalTasks=7、分布 6+1、3 项目、recentActivity=8）；备份下载、标签 CRUD、活动页分组均有 E2E 覆盖。
4. **双窗口 WS 验证（票 04）**：新增 `web/e2e/ws-dual-window.spec.ts` 5 项 —— 添加/移动/改名互相同步、项目隔离（B 窗口快照不变）、断线重连收敛（context.setOffline）。
5. **全量回归（票 05）**：见验证矩阵；mock 回退复验；视觉对比 board 关键尺寸 colW 280=280、cardH 115=115。

## 种子数据对齐说明

- 「原型演示」待办列 3 个精确标题任务（sort.spec 断言）+ 进行中 4 任务 + 前端/设计标签徽章 + 描述（对齐原型 demo board 卡片高度）。
- 「看板冒烟」待办 2 任务（delete-confirm/smoke/task-detail 用）；「标签冒烟」带标签任务（labels.spec 用）。

## 已知说明（非回归）

- board 视觉对比 colH：原型 demo 为静态 `height:100vh` 固定视口（列拉伸 796px），app 为内容自适应 flex（414px）——布局模型固有差异，非样式回归；关键尺寸 colW/cardH 均已对齐。
- E2E 需后端在 8080 运行且设 `KANSO_ACCESS_KEY`（与前端 `.env.development` 的 `VITE_USE_MOCK=false` 对应）；`KANSO_API_URL` 可覆盖后端地址。

## 运行方式

```bash
# 后端（固定密钥 + 独立数据目录）
KANSO_ACCESS_KEY=e2e-test-key KANSO_DATA_DIR=/tmp/kanso-e2e-data go run .

# 前端（已默认 VITE_USE_MOCK=false）
cd web && npx vite --port 5173 --strictPort

# E2E（另一终端）
cd web && KANSO_ACCESS_KEY=e2e-test-key npx playwright test
```
