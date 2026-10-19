// 拖入导入与 PDF 导出的单元测试：都只测纯 Go 逻辑，不开窗口。
package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 拖入的备份走的是设置页导入用的同一个接口：POST /api/settings/backup，
// 带 Bearer 密钥，body 就是备份文件的原始字节。
func TestImportBackupPostsToBackupEndpoint(t *testing.T) {
	path := filepath.Join(t.TempDir(), "kanso-backup.json")
	body := `{"version":1,"projects":[]}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("写备份文件失败: %v", err)
	}

	var gotMethod, gotPath, gotAuth, gotBody, gotContentType string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotContentType = r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// baseURL 与真实调用一致：带结尾斜杠的页面地址。
	if err := importBackup(srv.URL+"/", "k3y", path); err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/settings/backup" {
		t.Fatalf("应是 POST /api/settings/backup，实际 %s %s", gotMethod, gotPath)
	}
	if gotAuth != "Bearer k3y" {
		t.Fatalf("应带 Bearer 密钥，实际 %q", gotAuth)
	}
	if gotContentType != "application/json" {
		t.Fatalf("Content-Type 应为 application/json，实际 %q", gotContentType)
	}
	if gotBody != body {
		t.Fatalf("body 应是备份原文，实际 %q", gotBody)
	}
}

func TestImportBackupReportsHTTPFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(path, []byte(`{"x":1}`), 0o600); err != nil {
		t.Fatalf("写文件失败: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	err := importBackup(srv.URL+"/", "k3y", path)
	if err == nil || !strings.Contains(err.Error(), "HTTP 500") {
		t.Fatalf("导入失败应带上状态码，实际 %v", err)
	}
}

func TestImportBackupMissingFile(t *testing.T) {
	err := importBackup("http://127.0.0.1:1/", "k3y", filepath.Join(t.TempDir(), "absent.json"))
	if err == nil || !strings.Contains(err.Error(), "读取备份失败") {
		t.Fatalf("缺文件应报读取失败，实际 %v", err)
	}
}

func TestPDFFileNameHasDateAndExtension(t *testing.T) {
	name := pdfFileName()
	if !strings.HasPrefix(name, "kanso-") || !strings.HasSuffix(name, ".pdf") {
		t.Fatalf("PDF 文件名应为 kanso-<日期>.pdf，实际 %q", name)
	}
	if strings.ContainsAny(name, `\/`) {
		t.Fatalf("文件名不应含路径分隔符，实际 %q", name)
	}
}
