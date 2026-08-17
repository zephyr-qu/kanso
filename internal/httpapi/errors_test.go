// httpapi 错误路径测试：不存在资源 404、参数校验 400、非法 body。
// 主流程由 router_test.go 覆盖；此处补齐各 handler 的错误分支。
package httpapi_test

import (
	"net/http"
	"testing"
)

// TestNotFoundResponses 覆盖所有「资源不存在 → 404」的 handler 分支。
func TestNotFoundResponses(t *testing.T) {
	e := newTestEnv(t)

	cases := []struct {
		method string
		path   string
		body   string
	}{
		// 工作区
		{http.MethodPatch, "/api/workspaces/nope", `{"name":"x"}`},
		{http.MethodDelete, "/api/workspaces/nope", ""},
		// 项目
		{http.MethodGet, "/api/projects/nope", ""},
		{http.MethodGet, "/api/projects/nope/archived-tasks", ""},
		{http.MethodPatch, "/api/projects/nope", `{"name":"x"}`},
		{http.MethodDelete, "/api/projects/nope", ""},
		{http.MethodPost, "/api/projects/nope/columns", `{"name":"列"}`},
		{http.MethodPost, "/api/projects/nope/milestones", `{"name":"里程碑"}`},
		{http.MethodPost, "/api/projects/nope/labels", `{"name":"标签"}`},
		{http.MethodGet, "/api/projects/nope/milestones", ""},
		// 列
		{http.MethodPatch, "/api/columns/nope", `{"name":"x"}`},
		{http.MethodDelete, "/api/columns/nope", ""},
		{http.MethodPost, "/api/columns/nope/tasks", `{"title":"任务"}`},
		// 任务
		{http.MethodGet, "/api/tasks/nope", ""},
		{http.MethodPatch, "/api/tasks/nope", `{"title":"x"}`},
		{http.MethodDelete, "/api/tasks/nope", ""},
		{http.MethodPost, "/api/tasks/nope/archive", ""},
		{http.MethodPost, "/api/tasks/nope/restore", ""},
		{http.MethodPost, "/api/tasks/nope/comments", `{"content":"评论"}`},
		// 评论
		{http.MethodDelete, "/api/comments/nope", ""},
		// 标签
		{http.MethodPatch, "/api/labels/nope", `{"name":"x"}`},
		{http.MethodDelete, "/api/labels/nope", ""},
		// 里程碑
		{http.MethodPatch, "/api/milestones/nope", `{"name":"x"}`},
		{http.MethodDelete, "/api/milestones/nope", ""},
		// 成员（team 模式）
		{http.MethodPatch, "/api/members/nope", `{"name":"x"}`},
		{http.MethodDelete, "/api/members/nope", ""},
		{http.MethodPost, "/api/members/nope/key", ""},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			res, _ := e.do(t, tc.method, tc.path, tc.body)
			if res.StatusCode != http.StatusNotFound {
				t.Fatalf("%s %s 应 404，实际 %d", tc.method, tc.path, res.StatusCode)
			}
		})
	}
}

// TestBadRequestResponses 覆盖参数校验失败 → 400 的 handler 分支。
func TestBadRequestResponses(t *testing.T) {
	e := newTestEnv(t)
	// 建一个项目拿真实 ID。
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/projects", `{"name":"项目"}`)
	projectID := decode[map[string]any](t, body)["id"].(string)

	cases := []struct {
		method string
		path   string
		body   string
	}{
		// 非法 JSON body
		{http.MethodPost, "/api/workspaces", "{bad"},
		{http.MethodPost, "/api/workspaces/" + workspaceID + "/projects", "{bad"},
		{http.MethodPost, "/api/projects/" + projectID + "/columns", "{bad"},
		{http.MethodPost, "/api/columns/nope/tasks", "{bad"},
		// 缺必填字段
		{http.MethodPost, "/api/workspaces", `{}`},
		{http.MethodPost, "/api/workspaces/" + workspaceID + "/projects", `{}`},
		{http.MethodPost, "/api/projects/" + projectID + "/columns", `{"name":""}`},
		{http.MethodPost, "/api/columns/nope/tasks", `{"title":""}`},
		{http.MethodPost, "/api/tasks/nope/comments", `{"content":""}`},
		{http.MethodPost, "/api/members", `{}`},
		// 非法的 WIP 负数（列更新）
		{http.MethodPost, "/api/projects/" + projectID + "/columns", `{"name":"列","wipLimit":-1}`},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			res, _ := e.do(t, tc.method, tc.path, tc.body)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("%s %s 应 400，实际 %d (body=%s)", tc.method, tc.path, res.StatusCode, tc.body)
			}
		})
	}
}

// TestDetachLabelCrossProject 覆盖 detachLabel 的跨项目 400 分支。
func TestDetachLabelCrossProject(t *testing.T) {
	e := newTestEnv(t)
	projectA := createProject(t, e, "甲项目")
	projectB := createProject(t, e, "乙项目")

	// A 项目建任务 + 标签并关联。
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectA, "")
	colID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+colID+"/tasks", `{"title":"任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectA+"/labels", `{"name":"甲标签"}`)
	labelA := decode[map[string]any](t, body)["id"].(string)
	// B 项目标签。
	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectB+"/labels", `{"name":"乙标签"}`)
	labelB := decode[map[string]any](t, body)["id"].(string)

	// 摘除不属于该项目的标签 → 400。
	res, _ := e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/labels/"+labelB, "")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("跨项目摘标签应 400，实际 %d", res.StatusCode)
	}
	// 正常摘除 → 204。
	res, _ = e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/labels/"+labelA, "")
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("正常摘标签应 204，实际 %d", res.StatusCode)
	}
}

// TestMilestoneHandlerErrors 覆盖里程碑 handler 的 404/400 错误分支。
func TestMilestoneHandlerErrors(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "里程碑错误项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	colID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+colID+"/tasks", `{"title":"任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectID+"/milestones", `{"name":"里程碑"}`)
	msID := decode[map[string]any](t, body)["id"].(string)

	// 关联不存在任务 → 404。
	res, _ := e.do(t, http.MethodPost, "/api/tasks/nope/milestones/"+msID, "")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("关联不存在任务应 404，实际 %d", res.StatusCode)
	}
	// 关联不存在里程碑 → 404。
	res, _ = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/milestones/nope", "")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("关联不存在里程碑应 404，实际 %d", res.StatusCode)
	}
	// 跨项目关联 → 400。
	other := createProject(t, e, "另一项目")
	_, body = e.do(t, http.MethodPost, "/api/projects/"+other+"/milestones", `{"name":"外部里程碑"}`)
	otherMs := decode[map[string]any](t, body)["id"].(string)
	res, _ = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/milestones/"+otherMs, "")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("跨项目关联应 400，实际 %d", res.StatusCode)
	}
	// 正常关联 → 204。
	res, _ = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/milestones/"+msID, "")
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("正常关联应 204，实际 %d", res.StatusCode)
	}
	// 解关联不存在任务 → 404；正常解关联 → 204。
	res, _ = e.do(t, http.MethodDelete, "/api/tasks/nope/milestones/"+msID, "")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("解关联不存在任务应 404，实际 %d", res.StatusCode)
	}
	res, _ = e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/milestones/"+msID, "")
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("正常解关联应 204，实际 %d", res.StatusCode)
	}
}

// TestHandlerValidationErrors 覆盖参数校验错误分支（非法 WIP/空名称）。
func TestHandlerValidationErrors(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "校验项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	colID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectID+"/labels", `{"name":"标签"}`)
	labelID := decode[map[string]any](t, body)["id"].(string)

	// updateColumn：非法 WIP 类型 → 400。
	res, _ := e.do(t, http.MethodPatch, "/api/columns/"+colID, `{"wipLimit":"abc"}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("非法 WIP 应 400，实际 %d", res.StatusCode)
	}
	// updateColumn：负 WIP → 400。
	res, _ = e.do(t, http.MethodPatch, "/api/columns/"+colID, `{"wipLimit":-1}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("负 WIP 应 400，实际 %d", res.StatusCode)
	}
	// updateColumn：WIP null → 清除（200）。
	res, _ = e.do(t, http.MethodPatch, "/api/columns/"+colID, `{"wipLimit":null}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("WIP null 清除应 200，实际 %d", res.StatusCode)
	}
	// updateColumn：改名（200）。
	res, _ = e.do(t, http.MethodPatch, "/api/columns/"+colID, `{"name":"新列名"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("列改名应 200，实际 %d", res.StatusCode)
	}
	// updateColumn：改名 + 移动位置。
	res, _ = e.do(t, http.MethodPatch, "/api/columns/"+colID, `{"name":"再改名","position":2}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("列改名+移动应 200，实际 %d", res.StatusCode)
	}

	// updateLabel：空名称 → 400。
	res, _ = e.do(t, http.MethodPatch, "/api/labels/"+labelID, `{"name":""}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("空标签名应 400，实际 %d", res.StatusCode)
	}
}
