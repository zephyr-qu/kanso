package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/httpapi"
	"kanso/internal/realtime"
	"kanso/internal/service"
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

	if cfg.AccessKey == "" {
		key, err := generateAccessKey()
		if err != nil {
			log.Fatalf("生成访问密钥失败: %v", err)
		}
		cfg.AccessKey = key
		log.Printf("🔑 未设置 KANSO_ACCESS_KEY，本次启动随机生成（前端登录用；Docker 下用 docker logs 查看）: %s", key)
	}

	database, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("打开数据库失败: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		log.Fatalf("执行迁移失败: %v", err)
	}

	svc := service.New(database, cfg.Mode)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		log.Fatalf("初始化默认工作区失败: %v", err)
	}
	// 种子 owner 成员：把当前访问密钥写入 owner.access_key（登录体验与单密钥时代一致）。
	// 两种模式均执行——personal = 单一 owner 成员的团队模式（ADR-0013 修订）。
	if err := svc.SeedOwnerMember(context.Background(), cfg.AccessKey); err != nil {
		log.Fatalf("初始化所有者成员失败: %v", err)
	}
	// owner 名非 "Admin" 时把历史 'Admin' 归属重写为 owner 名（ADR-0013 决策 2）：
	// personal 模式下改名后同样生效，历史活动归属跟随显示名。
	if owner, ok := svc.OwnerMember(context.Background()); ok && owner.Name != "Admin" {
		if err := svc.ReownLegacyAdmin(context.Background(), owner.Name); err != nil {
			log.Printf("⚠️ 重写历史归属失败（非致命）: %v", err)
		}
	}

	httpapi.Version = version
	router := httpapi.NewRouterWithAssets(cfg, svc, realtime.NewHub(), web.DistFS())
	log.Printf("Kanso %s 已启动: http://%s （模式 %s, 健康检查 /api/health）", version, cfg.Addr, cfg.Mode)

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// 优雅关闭：SIGINT/SIGTERM 时停止接收新连接并等待在途请求完成（WAL 下事务安全）。
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("服务启动失败: %v", err)
		}
	}()
	<-ctx.Done()
	log.Println("收到退出信号，正在优雅关闭…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("优雅关闭失败: %v", err)
	}
}

func generateAccessKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
