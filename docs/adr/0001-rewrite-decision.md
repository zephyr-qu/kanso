# ADR-0001: 从零自研新项目（Go 重写 + 薄前端），非二开

Status: accepted

Kanso 最初按"基于 Kaneo 二次开发"立项，经多轮权衡后定案为**从零自研**：Go 重写后端 +
React 薄前端 + SQLite 单机存储。kaneo（TS 仓库，位于 `../kanso-ts`，含自己的 git 历史）
仅作为领域模型与 UI 设计的**参考**，其代码一行不复用；`kanso-ts` 内的二开指南、
未提交的品牌重命名等均不再有工程意义。产物是单二进制（内嵌 SQLite 与前端静态资源），
无 Node 运行时依赖。

Consequences:

- 工作目录：`F:/golang/kanso`（新 git 仓库，根目录即新项目；`kanso-ts/` 为参考子目录）
- 产品决策（共享密钥/单用户 admin/全权模式/砍计费集成附件）作为新项目的设计输入原样继承
- 不再有"跟随/分叉上游"的概念；`kanso-ts` 仅作设计参考
