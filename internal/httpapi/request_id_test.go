package httpapi

import (
	"encoding/json"
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
		{service.ErrMemberLimit, http.StatusConflict},
	}
	for _, tc := range cases {
		if got := statusForServiceError(tc.err); got != tc.want {
			t.Fatalf("错误 %v 应映射 %d，实际 %d", tc.err, tc.want, got)
		}
	}
}
