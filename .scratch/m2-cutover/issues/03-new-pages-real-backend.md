# 03 — 新功能页在真后端

**What to build:** dashboard（统计卡/分布/项目速览/需要关注/最近活动）、settings（密钥显示 + 备份下载）、标签库页（创建/重命名/删除）、活动页（按日分组时间线）四页在真实后端下功能可用——后端 4 个端点（dashboard/backup/activity/updated_at）已由 06 交付，本票验证其被前端正确消费。

**Blocked by:** 02 — 切换开关与基础链路

**Status:** done

- [x] dashboard 在真后端下统计正确——API 数值与种子一致（totalTasks=7、分布 6+1、3 项目、recentActivity=8）
- [x] settings 备份下载按钮消费真实端点（导出文件可下载）——misc.spec 下载断言 `kanso-backup-*.json` 通过
- [x] 标签库 CRUD 在真后端下可用——labels.spec 创建/重命名/删除 + 看板贴/摘全链路通过
- [x] 活动页在真后端下按日分组渲染——activity.spec「今天/昨天/更早」分组 + 文案格式通过
- [x] 四页真后端 E2E 覆盖——34 项 E2E 真后端全绿（8/11）
