// Package app 负责 Kanso 进程的启动、运行与关闭生命周期。
// cmd/kanso 只保留命令行参数、信号和退出码处理，领域初始化集中在这里。
package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/httpapi"
	"kanso/internal/realtime"
	"kanso/internal/service"
)

const defaultShutdownTimeout = 10 * time.Second

// App 是一个可运行的 Kanso 实例，持有 HTTP 服务及其数据库资源。
// New 成功返回后，调用方必须最终调用 Close 释放数据库连接。
type App struct {
	database dbHandle
	server   *http.Server
	service  *service.Service
}

// dbHandle 只暴露 Close，避免 App 的公开接口泄漏数据库实现细节。
type dbHandle interface {
	Close() error
}

// New 完成数据库、迁移、领域种子、路由和 HTTP Server 初始化。
// assets 可为 nil，此时非 API 路由返回 404；生产环境传入嵌入式前端资源。
func New(ctx context.Context, cfg config.Config, version string, assets fs.FS) (*App, error) {
	if err := config.Validate(cfg); err != nil {
		return nil, fmt.Errorf("启动配置校验失败: %w", err)
	}
	if cfg.AccessKey == "" {
		key, err := generateAccessKey()
		if err != nil {
			return nil, fmt.Errorf("生成访问密钥失败: %w", err)
		}
		cfg.AccessKey = key
		log.Printf("🔑 未设置 KANSO_ACCESS_KEY，本次启动随机生成（前端登录用；Docker 下用 docker logs 查看）: %s", key)
	}

	database, err := db.Open(cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	fail := func(cause error) (*App, error) {
		_ = database.Close()
		return nil, cause
	}

	if err := db.Migrate(database); err != nil {
		return fail(fmt.Errorf("执行迁移失败: %w", err))
	}
	migrationCount, err := db.AppliedMigrationCount(database)
	if err != nil {
		return fail(fmt.Errorf("读取迁移状态失败: %w", err))
	}
	log.Printf("数据库已就绪: data_dir=%s migrations=%d", cfg.DataDir, migrationCount)

	svc := service.New(database, cfg.Mode)
	svc.SetAutoArchiveSettings(cfg.AutoArchiveEnabled, cfg.AutoArchiveAfterDays)
	svc.SetBackupDir(filepath.Join(cfg.DataDir, "backups"))
	if err := svc.SeedDefaultWorkspace(ctx); err != nil {
		return fail(fmt.Errorf("初始化默认工作区失败: %w", err))
	}
	if err := svc.SeedOwnerMember(ctx, cfg.AccessKey); err != nil {
		return fail(fmt.Errorf("初始化所有者成员失败: %w", err))
	}
	// owner 名非 "Admin" 时把历史归属重写为当前 owner 名。
	if owner, ok := svc.OwnerMember(ctx); ok && owner.Name != "Admin" {
		if err := svc.ReownLegacyAdmin(ctx, owner.Name); err != nil {
			log.Printf("⚠️ 重写历史归属失败（非致命）: %v", err)
		}
	}

	hub := realtime.NewHub()
	httpapi.Version = version
	router := httpapi.NewRouterWithAssets(cfg, svc, hub, assets)
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	log.Printf("Kanso %s 已启动: http://%s （模式 %s, health=/api/health, ready=/api/ready）", version, cfg.Addr, cfg.Mode)

	return &App{database: database, server: server, service: svc}, nil
}

// Handler 返回已组装的应用路由，主要用于嵌入式测试和宿主集成。
func (a *App) Handler() http.Handler {
	return a.server.Handler
}

// Run 启动 HTTP 服务，并在 ctx 取消后执行优雅关闭。
func (a *App) Run(ctx context.Context) error {
	runCtx, cancelAutoArchive := context.WithCancel(ctx)
	defer cancelAutoArchive()
	go a.runAutoArchive(runCtx)

	serverErr := make(chan error, 1)
	go func() {
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- fmt.Errorf("服务启动失败: %w", err)
			return
		}
		serverErr <- nil
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		log.Println("收到退出信号，正在优雅关闭…")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), defaultShutdownTimeout)
		defer cancel()
		if err := a.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("优雅关闭失败: %w", err)
		}
		return nil
	}
}

const autoArchiveInterval = time.Minute

// runAutoArchive periodically applies the current settings. The first pass is
// immediate so tasks are not left behind until the next interval after startup.
func (a *App) runAutoArchive(ctx context.Context) {
	archive := func() {
		enabled, days := a.service.AutoArchiveSettings()
		if !enabled {
			return
		}
		if _, err := a.service.ArchiveDueCompletedTasks(ctx, days); err != nil && ctx.Err() == nil {
			log.Printf("⚠️ 自动归档失败: %v", err)
		}
	}
	archive()
	ticker := time.NewTicker(autoArchiveInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			archive()
		}
	}
}

// Shutdown 停止接收新连接并等待在途请求完成。
func (a *App) Shutdown(ctx context.Context) error {
	return a.server.Shutdown(ctx)
}

// Close 释放应用持有的数据库资源。HTTP 服务应先通过 Run 或 Shutdown 停止。
func (a *App) Close() error {
	return a.database.Close()
}

func generateAccessKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
