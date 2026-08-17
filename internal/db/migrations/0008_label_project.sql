-- 0008_label_project: 标签改为项目级（0006 规划 Phase 2，D1 决策）
-- 前端 Label.projectId / POST /api/projects/{id}/labels / Mock 均为项目级；
-- 后端由工作区级迁移到项目级。回填归属取工作区首个项目，无归属标签删除。
-- 已知限制（2026-08-16 决策：保持现状，不做回填增强）：升级前的标签若挂接在多项目
-- 工作区的多个项目任务上，回填会统一归到首个项目，跨项目任务的标签将无法再解除/改名
-- （AttachLabel/DetachLabel 的跨项目校验拒绝）；新库不受影响（无数据）。
DROP INDEX IF EXISTS idx_label_workspace;
ALTER TABLE label ADD COLUMN project_id TEXT REFERENCES project (
    id
) ON DELETE CASCADE;
UPDATE label SET project_id = (
    SELECT p.id
    FROM project AS p
    WHERE p.workspace_id = label.workspace_id
    ORDER BY p.created_at
    LIMIT 1
);
DELETE FROM label
WHERE project_id IS NULL;
ALTER TABLE label DROP COLUMN workspace_id;
CREATE INDEX idx_label_project ON label (project_id);
