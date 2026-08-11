package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"

	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/httpapi"
	"kanso/internal/realtime"
	"kanso/internal/service"
	"kanso/web"
)

func main() {
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

	svc := service.New(database)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		log.Fatalf("初始化默认工作区失败: %v", err)
	}

	router := httpapi.NewRouterWithAssets(cfg, svc, realtime.NewHub(), web.DistFS())
	log.Printf("Kanso 已启动: http://%s （健康检查 /api/health）", cfg.Addr)

	server := &http.Server{Addr: cfg.Addr, Handler: router}
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("服务启动失败: %v", err)
	}
}

func generateAccessKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
