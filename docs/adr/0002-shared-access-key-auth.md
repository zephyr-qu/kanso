# ADR-0002: 共享访问密钥认证 + 单用户 Admin

Status: accepted

内网信任环境（1-3 人）下，完整账号体系是纯负担。Kanso 采用**单一共享访问密钥**：
`KANSO_ACCESS_KEY` 环境变量可配，未配置则启动时随机生成并打印到控制台。前端首次进入
输入密钥，存 localStorage，请求以 `Authorization: Bearer <key>` 携带（前端注入点为
fetch 封装，一处生效）。数据模型无 user/成员/角色表：所有请求以**固定 Admin Identity**
执行（任务负责人、评论作者、活动记录归属该身份）；权限为**全权模式**，密钥校验通过即放行。

Consequences:

- 首启自动种子：检测无 workspace 时创建默认工作区（admin 身份为常量，不入库）
- 密钥随机生成时，重启后前端需重新输入（Docker 部署用 `docker logs` 查初始密钥）
- 公开分享页（如后置实现）与健康检查等公开端点需白名单绕过密钥校验
