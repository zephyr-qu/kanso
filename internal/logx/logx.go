// Package logx 用标准库 log/slog 提供进程级结构化日志。
// 默认文本格式、info 级别；KANSO_LOG_FORMAT=json、KANSO_LOG_LEVEL 可覆盖。
package logx

import (
	"log/slog"
	"os"
	"strings"
)

const (
	FormatText = "text"
	FormatJSON = "json"
)

// ConfigureFromEnv 按环境变量安装默认 slog Handler。
func ConfigureFromEnv() {
	Configure(os.Getenv("KANSO_LOG_FORMAT"), os.Getenv("KANSO_LOG_LEVEL"))
}

// Configure 安装默认 Logger。format 为 json 时输出 JSON，其余为 text。
// level 支持 debug/info/warn/error，非法值回退 info。
func Configure(format, level string) {
	opts := &slog.HandlerOptions{Level: parseLevel(level)}
	var handler slog.Handler
	if strings.EqualFold(strings.TrimSpace(format), FormatJSON) {
		handler = slog.NewJSONHandler(os.Stderr, opts)
	} else {
		handler = slog.NewTextHandler(os.Stderr, opts)
	}
	slog.SetDefault(slog.New(handler))
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// With 返回带固定属性的 Logger，便于请求路径挂 request_id。
func With(args ...any) *slog.Logger {
	return slog.Default().With(args...)
}
