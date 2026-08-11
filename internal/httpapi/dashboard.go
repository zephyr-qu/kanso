// 仪表盘与备份导出端点（对接契约：前端 mock 已定义，后端照实现）。
package httpapi

import (
	"net/http"
)

// getDashboard 返回仪表盘聚合（统计卡 / 分布 / 项目速览 / 需要关注 / 最近活动）。
func (a *API) getDashboard(w http.ResponseWriter, r *http.Request) {
	data, err := a.svc.GetDashboard(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "查询仪表盘失败")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// getBackup 导出全量数据快照（只导出不提供恢复）。
func (a *API) getBackup(w http.ResponseWriter, r *http.Request) {
	data, err := a.svc.GetBackup(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "导出备份失败")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// getActivity 返回全局活动流（活动页数据源）。
func (a *API) getActivity(w http.ResponseWriter, r *http.Request) {
	data, err := a.svc.GetActivities(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "查询活动失败")
		return
	}
	writeJSON(w, http.StatusOK, data)
}
