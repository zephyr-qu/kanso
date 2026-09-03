package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"kanso/internal/auth"
	"kanso/internal/service"
)

// resourceAccessMiddleware is the adapter seam for workspace isolation. It
// resolves the owning workspace before any resource handler can read or mutate
// a project, board, task, label, milestone, or comment.
func (a *API) resourceAccessMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		workspaceID, resourceType, resourceID := workspaceContextFromPath(r.URL.Path)
		if resourceID != "" {
			if err := a.admission.AdmitResource(
				r.Context(), auth.MemberID(r), resourceType, resourceID,
			); err != nil {
				fallback := "资源不存在"
				if errors.Is(err, service.ErrForbidden) {
					fallback = "无权访问当前工作区"
				}
				writeServiceError(w, err, fallback)
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		if workspaceID == "" {
			next.ServeHTTP(w, r)
			return
		}
		if err := a.admission.AdmitWorkspace(r.Context(), auth.MemberID(r), workspaceID); err != nil {
			writeServiceError(w, err, "无权访问当前工作区")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func workspaceContextFromPath(path string) (workspaceID string, resourceType service.ResourceType, resourceID string) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 || parts[0] != "api" {
		return "", "", ""
	}
	switch parts[1] {
	case "workspaces":
		return parts[2], "", ""
	case "projects":
		return "", service.ResourceProject, pathPart(parts, 2)
	case "columns":
		return "", service.ResourceColumn, pathPart(parts, 2)
	case "tasks":
		return "", service.ResourceTask, pathPart(parts, 2)
	case "labels":
		return "", service.ResourceLabel, pathPart(parts, 2)
	case "milestones":
		return "", service.ResourceMilestone, pathPart(parts, 2)
	case "comments":
		return "", service.ResourceComment, pathPart(parts, 2)
	default:
		return "", "", ""
	}
}

func pathPart(parts []string, index int) string {
	if len(parts) <= index || parts[index] == "" {
		return ""
	}
	return parts[index]
}

func (a *API) requireCapability(w http.ResponseWriter, r *http.Request, capability service.Capability) bool {
	if err := a.svc.RequireCapability(r.Context(), auth.MemberID(r), capability); err != nil {
		if errors.Is(err, service.ErrForbidden) {
			writeError(w, http.StatusForbidden, "当前成员没有执行此操作的权限")
			return false
		}
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "成员不存在")
			return false
		}
		writeServiceError(w, err, "检查成员权限失败")
		return false
	}
	return true
}
