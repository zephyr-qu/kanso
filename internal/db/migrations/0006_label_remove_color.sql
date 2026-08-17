-- 标签颜色由前端主题统一控制，不再作为后端领域字段保存。
ALTER TABLE label DROP COLUMN color;
