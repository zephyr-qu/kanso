# ADR-0005: 部署形态——Docker 单容器

Status: accepted

内网单机部署：Docker **单容器**，镜像内无 Node 运行时（前端静态资源 + 后端二进制 + 内嵌
SQLite 全在镜像/挂载卷内）。数据持久化 = 卷挂载 SQLite 单文件（备份=复制文件）。
`KANSO_ACCESS_KEY` 经环境变量注入；未配置则启动随机生成打印（`docker logs` 查看）。
单实例内存广播（不引入 Redis）。

Consequences:

- 镜像预估 <50MB（多阶段构建，Go 静态编译 + 前端产物）
- 升级 = 换镜像重建容器；数据文件不受影响
- 公开端口：HTTP（Web + API 同端口，静态与 /api 由同一二进制服务）
