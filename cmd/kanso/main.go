package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"kanso/internal/app"
	"kanso/internal/config"
	"kanso/web"
)

// version 由构建时注入（-ldflags "-X main.version=..."），本地开发构建为 "dev"。
var version = "dev"

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-version") {
		fmt.Printf("kanso %s\n", version)
		return
	}

	cfg := config.Load()
	application, err := app.New(context.Background(), cfg, version, web.DistFS())
	if err != nil {
		log.Fatalf("初始化应用失败: %v", err)
	}
	defer application.Close()

	// 进程信号只负责取消生命周期 context，具体启动/优雅关闭由 internal/app 统一处理。
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := application.Run(ctx); err != nil {
		log.Print(err)
	}
}
