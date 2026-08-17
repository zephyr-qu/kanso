-- 0009_actor_columns: 归属身份列（ADR-0013 决策 3）
-- team 模式按成员归属，personal 模式恒为 'Admin'。
-- 历史数据重写由 service 层在 team 模式启动时执行（ReownLegacyAdmin），不在此迁移内。
ALTER TABLE activity ADD COLUMN actor TEXT NOT NULL DEFAULT 'Admin';
ALTER TABLE comment ADD COLUMN author TEXT NOT NULL DEFAULT 'Admin';
