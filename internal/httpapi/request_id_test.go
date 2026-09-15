package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"kanso/internal/service"
)

func TestRequestIDMiddlewarePreservesSafeIncomingID(t *testing.T) {
	handler := requestIDMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusInternalServerError, "测试错误")
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("X-Request-ID", "req-test-123")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if got := res.Header().Get("X-Request-ID"); got != "req-test-123" {
		t.Fatalf("响应应回传请求 ID，实际 %q", got)
	}
	var body map[string]string
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["requestId"] != "req-test-123" {
		t.Fatalf("错误响应应携带请求 ID，实际 %v", body)
	}
}

func TestServiceErrorStatusMapping(t *testing.T) {
	cases := []struct {
		err  error
		want int
	}{
		{service.ErrNotFound, http.StatusNotFound},
		{service.ErrForbidden, http.StatusForbidden},
		{service.ErrInvalidBackup, http.StatusBadRequest},
		{service.ErrLastWorkspace, http.StatusBadRequest},
		{service.ErrLastAdmin, http.StatusBadRequest},
		{service.ErrAdminLimit, http.StatusBadRequest},
		{service.ErrMemberLimit, http.StatusConflict},
		{errors.New("db down"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		if got := statusForServiceError(tc.err); got != tc.want {
			t.Fatalf("错误 %v 应映射 %d，实际 %d", tc.err, tc.want, got)
		}
	}
}

func TestClientMessageForServiceError(t *testing.T) {
	wrappedInput := fmt.Errorf("%w: 文本不能为空", service.ErrInvalidInput)
	cases := []struct {
		err      error
		fallback string
		want     string
	}{
		{service.ErrNotFound, "查询失败", "资源不存在"},
		{service.ErrForbidden, "查询失败", "无权执行此操作"},
		{service.ErrCrossProjectMove, "操作失败", "不能跨项目操作"},
		{service.ErrLabelNotFound, "创建失败", "标签不存在"},
		{service.ErrInvalidBackup, "导入失败", "备份文件格式无效"},
		{service.ErrLastWorkspace, "删除失败", "至少保留一个工作区"},
		{service.ErrReservedName, "更新失败", "成员名称不能为 Admin（保留名）"},
		{service.ErrMemberLimit, "创建失败", "成员和管理员总数已达上限（6 人）"},
		{service.ErrLastAdmin, "删除失败", "至少保留一名管理员"},
		{service.ErrAdminLimit, "更新失败", "管理员数量最多为 2 名"},
		{service.ErrProjectArchived, "更新失败", "项目已归档，无法修改"},
		{service.ErrProjectHasIncompleteTasks, "归档失败", "请先完成或归档未完成任务后再归档项目"},
		{service.ErrInvalidInput, "创建失败", "请求参数无效"},
		{wrappedInput, "AI 分析失败", "文本不能为空"},
		{errors.New("db down"), "创建任务失败", "创建任务失败"},
	}
	for _, tc := range cases {
		if got := clientMessageForServiceError(tc.err, tc.fallback); got != tc.want {
			t.Fatalf("错误 %v 文案应为 %q，实际 %q", tc.err, tc.want, got)
		}
	}
}
