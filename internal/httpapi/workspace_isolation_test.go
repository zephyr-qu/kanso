package httpapi_test

import (
	"fmt"
	"net/http"
	"testing"
)

// TestWorkspaceIsolationMatrix verifies the boundary between a global member
// identity and its per-workspace authorization relation.
func TestWorkspaceIsolationMatrix(t *testing.T) {
	e := newTestEnv(t)

	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaces := decode[[]map[string]any](t, body)
	firstWorkspaceID := workspaces[0]["id"].(string)

	res, body := e.do(t, http.MethodPost, "/api/workspaces", `{"name":"第二工作区"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建第二工作区应 201，实际 %d: %s", res.StatusCode, body)
	}
	secondWorkspaceID := decode[map[string]any](t, body)["id"].(string)

	_, body = e.do(t, http.MethodPost, "/api/workspaces/"+secondWorkspaceID+"/projects", `{"name":"隔离项目"}`)
	secondProjectID := decode[map[string]any](t, body)["id"].(string)

	res, body = e.do(t, http.MethodPost, "/api/members", `{"name":"普通成员"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建全局成员应 201，实际 %d: %s", res.StatusCode, body)
	}
	memberID := decode[map[string]any](t, body)["id"].(string)
	if res, _ := e.do(t, http.MethodPost, "/api/workspaces/"+firstWorkspaceID+"/members", fmt.Sprintf(`{"memberId":%q}`, memberID)); res.StatusCode != http.StatusNoContent {
		t.Fatalf("授权成员进入工作区应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodPost, "/api/members/"+memberID+"/key", "")
	memberKey := decode[map[string]any](t, body)["key"].(string)

	res, body = e.doAuth(t, memberKey, http.MethodGet, "/api/workspaces", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("普通成员读取可访问工作区应 200，实际 %d", res.StatusCode)
	}
	visible := decode[[]map[string]any](t, body)
	if len(visible) != 1 || visible[0]["id"] != firstWorkspaceID {
		t.Fatalf("普通成员只能看到已授权工作区，实际 %+v", visible)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/workspaces/"+firstWorkspaceID+"/projects", ""); res.StatusCode != http.StatusOK {
		t.Fatalf("普通成员应可读取已授权工作区，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/workspaces/"+secondWorkspaceID+"/projects", ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员读取未授权工作区应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/projects/"+secondProjectID, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员读取未授权项目应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/workspaces/"+secondWorkspaceID+"/dashboard", ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员读取未授权仪表盘应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/settings/backup", ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员读取全量备份应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.do(t, http.MethodGet, "/api/workspaces/does-not-exist/projects", ""); res.StatusCode != http.StatusNotFound {
		t.Fatalf("管理员读取不存在工作区应 404，实际 %d", res.StatusCode)
	}

	if res, _ := e.do(t, http.MethodDelete, "/api/workspaces/"+firstWorkspaceID+"/members/"+memberID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("移除当前工作区授权应 204，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/workspaces/"+firstWorkspaceID+"/projects", ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("移除授权后成员应立即失去访问，实际 %d", res.StatusCode)
	}

	if res, _ := e.do(t, http.MethodPatch, "/api/members/"+memberID+"/role", `{"role":"admin"}`); res.StatusCode != http.StatusOK {
		t.Fatalf("提升为管理员应 200，实际 %d", res.StatusCode)
	}
	res, body = e.doAuth(t, memberKey, http.MethodGet, "/api/workspaces", "")
	if res.StatusCode != http.StatusOK || len(decode[[]map[string]any](t, body)) != 2 {
		t.Fatalf("管理员应自动看到全部工作区，实际 %d: %s", res.StatusCode, body)
	}
}
