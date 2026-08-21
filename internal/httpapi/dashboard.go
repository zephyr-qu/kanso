// 仪表盘与备份（导出/导入）端点（对接契约：前端 mock 已定义，后端照实现）。
package httpapi

import (
	"errors"
	"net/http"

	"kanso/internal/service"
)

// getDashboard 返回仪表盘聚合（统计卡 / 分布 / 项目速览 / 需要关注 / 最近活动）。
func (a *API) getDashboard(w http.ResponseWriter, r *http.Request) {
	data, err := a.svc.GetDashboard(r.Context())
	if err != nil {
		writeServiceError(w, err, "查询仪表盘失败")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// getBackup 导出全量数据快照。
func (a *API) getBackup(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwnerInTeam(w, r) {
		return
	}
	data, err := a.svc.GetBackup(r.Context())
	if err != nil {
		writeServiceError(w, err, "导出备份失败")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// importBackup 导入备份快照（恢复还原）：JSON 全量替换当前数据。
func (a *API) importBackup(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwnerInTeam(w, r) {
		return
	}
	var body service.BackupData
	if !decodeBody(w, r, &body) {
		return
	}
	// 缺 workspaces 即非法快照：全量替换是破坏性操作，拒绝格式不符的 body（与 mock 一致）。
	if len(body.Workspaces) == 0 {
		writeError(w, http.StatusBadRequest, "备份文件格式无效")
		return
	}
	if err := a.svc.ImportBackup(r.Context(), body); err != nil {
		if errors.Is(err, service.ErrInvalidBackup) {
			writeError(w, http.StatusBadRequest, "备份文件格式无效")
			return
		}
		writeServiceError(w, err, "导入备份失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// getActivity 返回全局活动流（活动页数据源）。
func (a *API) getActivity(w http.ResponseWriter, r *http.Request) {
	data, err := a.svc.GetActivities(r.Context())
	if err != nil {
		writeServiceError(w, err, "查询活动失败")
		return
	}
	writeJSON(w, http.StatusOK, data)
}
