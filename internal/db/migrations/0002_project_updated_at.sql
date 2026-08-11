-- 0002_project_updated_at: project 表增加 updated_at 列（创建/重命名时由应用写入，列表接口返回）。
-- 已有数据回填为空串（前端对空 updatedAt 回退显示 createdAt）。
ALTER TABLE project ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
