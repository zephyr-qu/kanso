# ADR-0006: 看板领域 hooks 下沉 + 写操作副作用单出口

Status: accepted

M1 交付后架构审查（improve-codebase-architecture）识别出两处浅模块并给出深化候选，经
grilling 决策树逐项确认后落地。特记录决策与取舍，避免未来架构审查重复建议或推翻。

## 背景

- **前端看板页浅模块**：`board.tsx` 661 行混装列 CRUD、任务 CRUD、标签管理、dnd-kit
  拖拽编排、12 个 mutation 的乐观更新与失效；`toggleLabel` 用裸 `api()` 与其余 mutation
  风格不一致。接口（props/回调/隐式 query key 契约）几乎与实现等复杂。
- **后端副作用纪律散点**：每个写操作都要手工执行"记 Activity（纳秒时间戳、JSON data）+
  广播（事件类型、projectID 而非 taskID）"两条副作用，23 处散落 4 个文件；实现中已踩过
  taskID/projectID 混淆 bug，漏记副作用只会让活动流静默缺一条。

## 决策

1. **看板页按领域拆为三个 hooks**：`useBoardData`（查询 + 列操作）、`useTaskMutations`
   （任务 CRUD/移动）、`useLabelMutations`（标签 CRUD/贴摘）。纯展示组件
   （SortableColumn / SortableTaskCard / AddTaskForm）拆至 `components/board/`。
   `board.tsx` 从 661 行降到 ~270 行，只做编排与渲染；dnd 事件只做"事件→目标列/位置"映射。
2. **拖拽乐观更新/回滚收敛进 mutation**：列/任务移动的"读缓存→重排→写缓存→失败还原"
   全部在 `onMutate`/`onError` 内，重排纯函数（`moveColumnInBoard`/`moveTaskInBoard`）
   随 hook 模块导出。
3. **前端 query key 工厂**：`query-keys.ts` 统一 key 形状与失效映射（invalidateBoard /
   invalidateBoardScope / invalidateTask），全站页面接入，无裸字符串漂移。
4. **后端写操作副作用单出口**：`internal/service/events.go` 定义类型化 `Event` 结构
   （Action / ProjectID / WorkspaceID / EntityID / ActivityTaskID / Data / RecordActivity）
   与动作常量；`s.dispatch` 是唯一调用 recordActivity + emit/emitAll 的入口，纪律
   （先活动后广播、纳秒时间戳、资源归属）只写一次。写操作对外签名不变（API 缝测试零改动）。
5. **事件动作常量前后端各自枚举**：Go 侧 `events.go` 常量 / 前端 `lib/events.ts`
   `EVENT_TYPES` + `ACTION_LABELS`，字符串值即合约（ADR-0004"前后端无共享类型包"约束内）。

## Consequences

- **新增看板操作的默认路径**：前端在对应领域 hook 内加 mutation（自带失效/乐观更新）；
  后端写操作构造 `Event` 调 `dispatch`（自带活动+广播）——"记得记活动/广播"的纪律被结构消除。
- **service 保持单体深模块不拆**：其接口（~30 薄方法）远小于实现（sqlc、事务、reindex、
  级联删除、活动、广播），拆分会产生 6 个浅模块并破坏"接口即测试面"的单一 API 缝。
  决策 1-5 均在其**内部**加深（内部 seam），不改对外接口。
- **前端仍不建测试基建**（spec 单缝决策不变）：行为由 21 个 API 缝测试 + typecheck/构建覆盖。
- **评论类事件需设置 `ActivityTaskID`**：广播实体（commentID）与活动归属（taskID）不同，
  忘记设置会导致活动流缺失 comment.created（有回归测试 TestCommentsAndActivity 兜底）。
