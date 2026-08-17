-- 0004_archive_wip: 原型驱动的任务归档与列 WIP 警告配置。
ALTER TABLE task ADD COLUMN archived_at TEXT;
ALTER TABLE column ADD COLUMN wip_limit INTEGER;
