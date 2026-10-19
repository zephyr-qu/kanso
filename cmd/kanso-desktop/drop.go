// 把备份文件拖进窗口就能导入（M6-8）。
//
// 走的是设置页「导入备份」用的同一个接口（POST /api/settings/backup，全量替换），
// 所以行为和从设置页导入一致；成功后让页面重载，清掉前端查询缓存。
package main

import (
	"bytes"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo"
)

// backupTimeout 是一次导入请求的超时：备份可能不小，但走的是本机回环。
const backupTimeout = 60 * time.Second

// handleFileDrop 处理拖进窗口的文件：只认 .json 备份，一次导一个。
func handleFileDrop(win *mygo.Window, baseURL, accessKey string) {
	win.OnFileDrop(func(e *mygo.FileDropEvent) {
		for _, path := range e.Paths {
			if !strings.EqualFold(filepath.Ext(path), ".json") {
				slog.Info("拖入的文件不是 .json 备份，忽略", slog.String("path", path))
				continue
			}
			go func(p string) {
				if err := importBackup(baseURL, accessKey, p); err != nil {
					slog.Error("拖入导入失败", slog.String("path", p), slog.Any("err", err))
					return
				}
				slog.Info("拖入导入完成，重载页面", slog.String("path", p))
				// 导入是全量替换：和设置页导入后一样重载，清掉前端缓存。
				if _, err := win.Page().Eval("window.location.reload()"); err != nil {
					slog.Warn("重载页面失败", slog.Any("err", err))
				}
			}(path)
			return
		}
		slog.Info("拖入的文件里没有 .json 备份")
	})
}

// importBackup 把备份文件 POST 给正在运行的本机实例。
func importBackup(baseURL, accessKey, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("读取备份失败: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, baseURL+"api/settings/backup", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("构造导入请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessKey)
	resp, err := (&http.Client{Timeout: backupTimeout}).Do(req)
	if err != nil {
		return fmt.Errorf("导入请求失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("导入失败：HTTP %d", resp.StatusCode)
	}
	return nil
}
