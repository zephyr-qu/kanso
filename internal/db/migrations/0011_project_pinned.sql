-- 0011_project_pinned: 项目置顶（侧边栏"置顶"分组直达）。pinned=1 跨工作区出现在置顶列表。
ALTER TABLE project ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_project_pinned ON project (pinned);
