// 桌面壳的文件导出（M6-4）：页面把要保存的内容交给 Go，由 Go 弹系统的「另存为」
// 对话框写盘。这样导出不依赖各平台 WebView 对 blob 下载的支持差异，
// 用户也真的能选保存位置（WebView 自己的下载 UI 被 MyGo 关掉了）。
package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

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

// SavePDF 把调用方窗口的当前页面打印成 PDF（M6-8）：页面的打印样式表会生效，
// 导出的是一份可阅读的文档而不是截图。返回保存路径，用户取消时返回空串。
func (e exporter) SavePDF(ctx context.Context) (string, error) {
	return e.savePDF(mygo.CallerWindow(ctx))
}

// savePDF 是绑定方法与菜单项的共同实现：先打印，再让用户选位置。
func (e exporter) savePDF(win *mygo.Window) (string, error) {
	if win == nil || win.Page() == nil {
		return "", errors.New("没有可打印的窗口")
	}
	pdf, err := win.Page().PrintToPDF(mygo.PDFOptions{
		PageSize:   mygo.PageA4,
		Background: true, // 看板与里程碑靠背景色区分列和状态，打印时不能丢
	})
	if err != nil {
		return "", fmt.Errorf("生成 PDF 失败: %w", err)
	}
	if len(pdf) == 0 {
		return "", errors.New("生成的 PDF 是空的")
	}
	name := pdfFileName()

	if e.smokeDir != "" {
		path := filepath.Join(e.smokeDir, name)
		if err := os.WriteFile(path, pdf, 0o600); err != nil {
			return "", fmt.Errorf("冒烟导出 PDF 失败: %w", err)
		}
		slog.Info("冒烟：PDF 已写入", slog.String("path", path), slog.Int("bytes", len(pdf)))
		return path, nil
	}

	path, err := mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent:      win,
		Title:       "导出 PDF",
		DefaultPath: defaultSavePath(name),
	})
	if err != nil {
		return "", fmt.Errorf("打开保存对话框失败: %w", err)
	}
	if path == "" {
		return "", nil // 用户取消
	}
	if err := os.WriteFile(path, pdf, 0o600); err != nil {
		return "", fmt.Errorf("写入 %s 失败: %w", path, err)
	}
	slog.Info("已导出 PDF", slog.String("path", path), slog.Int("bytes", len(pdf)))
	return path, nil
}

// pdfFileName 用当天日期命名，导出多份时不互相覆盖。
func pdfFileName() string {
	return "kanso-" + time.Now().Format("2006-01-02") + ".pdf"
}
