package httpapi

import (
	"net/http"
	"strings"
)

// searchTasks 全局搜索（⌘K 命令面板）：q 参数匹配任务标题/描述，返回最近更新的命中。
func (a *API) searchTasks(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	results, err := a.svc.SearchTasks(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "搜索失败")
		return
	}
	writeJSON(w, http.StatusOK, results)
}
