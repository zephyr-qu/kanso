-- 0003_task_priority_due: 任务优先级与截止日期（原型 task-card 信息密度）
ALTER TABLE task ADD COLUMN priority TEXT NOT NULL DEFAULT 'med';
ALTER TABLE task ADD COLUMN due_date TEXT;
