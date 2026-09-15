package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/httpapi"
	"kanso/internal/realtime"
	"kanso/internal/service"
)

func TestAICaptureAnalyze(t *testing.T) {
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{
					"content": `{"tasks":[{"title":"从邮件跟进报价","priority":"high","dueDate":"2026-12-15"}]}`,
				}},
			},
		})
	}))
	t.Cleanup(llm.Close)

	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	svc := service.New(database, config.ModeTeam)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := svc.SeedAdminMember(context.Background(), testKey); err != nil {
		t.Fatal(err)
	}
	workspaces, err := svc.ListWorkspaces(context.Background())
	if err != nil || len(workspaces) == 0 {
		t.Fatalf("workspaces: %v", err)
	}
	wsID := workspaces[0].ID
	if _, err := svc.CreateProject(context.Background(), wsID, "AI项目"); err != nil {
		t.Fatal(err)
	}

	cfgPath := filepath.Join(t.TempDir(), "kanso-config.json")
	t.Setenv("KANSO_CONFIG_FILE", cfgPath)
	cfg := config.Config{
		Addr:                 "127.0.0.1:0",
		AccessKey:            testKey,
		Mode:                 config.ModeTeam,
		AutoArchiveEnabled:   config.DefaultAutoArchiveEnabled,
		AutoArchiveAfterDays: config.DefaultAutoArchiveAfterDays,
		AIBaseURL:            llm.URL + "/v1",
		AIAPIKey:             "test-ai-key",
		AIModel:              "gpt-test",
	}
	srv := httptest.NewServer(httpapi.NewRouter(cfg, svc, realtime.NewHub()))
	t.Cleanup(srv.Close)
	e := &testEnv{srv: srv, db: database}

	res, _ := e.do(t, http.MethodPost, "/api/workspaces/"+wsID+"/ai-capture/analyze", `{"text":""}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("空文本应 400，实际 %d", res.StatusCode)
	}

	res, body := e.do(t, http.MethodPost, "/api/workspaces/"+wsID+"/ai-capture/analyze",
		`{"text":"请跟进报价邮件"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("analyze 应 200，实际 %d body=%s", res.StatusCode, body)
	}
	parsed := decode[map[string]any](t, body)
	tasks, _ := parsed["tasks"].([]any)
	if len(tasks) != 1 {
		t.Fatalf("应返回 1 条任务，实际 %v", body)
	}
	task := tasks[0].(map[string]any)
	if task["title"] != "从邮件跟进报价" || task["priority"] != "high" {
		t.Fatalf("任务字段不符: %v", task)
	}
	if task["projectId"] == "" || task["columnId"] == "" {
		t.Fatalf("应填入默认项目与列: %v", task)
	}
}

func TestAICaptureAnalyzeRequiresKey(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	wsID := decode[[]map[string]any](t, body)[0]["id"].(string)
	res, body := e.do(t, http.MethodPost, "/api/workspaces/"+wsID+"/ai-capture/analyze",
		`{"text":"做一件事"}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("未配置 AI 应 400，实际 %d body=%s", res.StatusCode, body)
	}
	if !strings.Contains(string(body), "未配置 AI") {
		t.Fatalf("错误应提示未配置 AI，实际 %s", body)
	}
}

func TestSettingsConfigExposesAIFlags(t *testing.T) {
	cfgPath := filepath.Join(t.TempDir(), "kanso-config.json")
	t.Setenv("KANSO_CONFIG_FILE", cfgPath)
	e := newTestEnv(t)
	res, body := e.do(t, http.MethodGet, "/api/settings/config", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET 配置应 200，实际 %d", res.StatusCode)
	}
	cfg := decode[map[string]any](t, body)
	if _, ok := cfg["aiAPIKey"]; ok {
		t.Fatal("不应回传 aiAPIKey")
	}
	if configured, _ := cfg["aiConfigured"].(bool); configured {
		t.Fatal("默认应未配置 AI")
	}
	res, _ = e.do(t, http.MethodPut, "/api/settings/config",
		`{"addr":":8080","dataDir":"./data","wsOrigins":"","aiBaseURL":"https://example.com/v1","aiModel":"m1","aiAPIKey":"sk-test"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("保存 AI 配置应 200，实际 %d", res.StatusCode)
	}
	fileCfg, err := config.ReadFile(cfgPath)
	if err != nil || fileCfg.AIAPIKey != "sk-test" || fileCfg.AIModel != "m1" {
		t.Fatalf("文件应写入 AI 配置: %+v err=%v", fileCfg, err)
	}
	_, body = e.do(t, http.MethodGet, "/api/settings/config", "")
	cfg = decode[map[string]any](t, body)
	if configured, _ := cfg["aiConfigured"].(bool); !configured {
		t.Fatal("保存后 aiConfigured 应为 true")
	}
}
