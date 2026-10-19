// 桌面壳的文件导出（M6-4）：页面把要保存的内容交给 Go，由 Go 弹系统的「另存为」
// 对话框写盘。这样导出不依赖各平台 WebView 对 blob 下载的支持差异，
// 用户也真的能选保存位置（WebView 自己的下载 UI 被 MyGo 关掉了）。
package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/egoist/mygo"
)

// exporterService 是页面调用时的服务名：window.mygo.call("Exporter.SaveFile", …)。
const exporterService = "Exporter"

// exporter 是绑定给页面的服务。
type exporter struct {
	// smokeDir 非空（自动化冒烟）时不弹对话框，直接写到这个目录。
	smokeDir string
}

// SaveFile 让用户选位置并写入 data，返回保存的路径；用户取消时返回空串。
// data 用 base64 字符串传：不依赖 IPC 对字节数组的编解码约定。
// 绑定方法在各自的 goroutine 上运行，所以这里可以安全地弹模态对话框。
func (e exporter) SaveFile(ctx context.Context, name, dataBase64 string) (string, error) {
	name = safeFileName(name)
	data, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		return "", fmt.Errorf("导出内容不是有效的 base64: %w", err)
	}

	if e.smokeDir != "" {
		path := filepath.Join(e.smokeDir, name)
		if err := os.WriteFile(path, data, 0o600); err != nil {
			return "", fmt.Errorf("冒烟导出写入失败: %w", err)
		}
		slog.Info("冒烟：导出已写入", slog.String("path", path), slog.Int("bytes", len(data)))
		return path, nil
	}

	path, err := mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent:      mygo.CallerWindow(ctx),
		Title:       "保存",
		DefaultPath: defaultSavePath(name),
	})
	if err != nil {
		return "", fmt.Errorf("打开保存对话框失败: %w", err)
	}
	if path == "" {
		return "", nil // 用户取消
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", fmt.Errorf("写入 %s 失败: %w", path, err)
	}
	slog.Info("已导出", slog.String("path", path), slog.Int("bytes", len(data)))
	return path, nil
}

// defaultSavePath 把建议文件名放进用户的下载目录；取不到时只给文件名。
func defaultSavePath(name string) string {
	if dir, err := mygo.App.Path(mygo.PathDownloads); err == nil && dir != "" {
		return filepath.Join(dir, name)
	}
	return name
}

// safeFileName 只取文件名部分，避免页面传来的名字跳出目标目录。
func safeFileName(name string) string {
	cleaned := filepath.Base(strings.ReplaceAll(name, `\`, "/"))
	switch cleaned {
	case "", ".", "/", "..":
		return "kanso-export"
	}
	return cleaned
}
