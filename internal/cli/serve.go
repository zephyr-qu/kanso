package cli

import (
	"context"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"

	"kanso/internal/app"
	"kanso/internal/config"
	"kanso/internal/logx"
)

// ServeAssets 是 serve 命令需要的嵌入式静态资源。
type ServeAssets struct {
	SPA fs.FS
}

func newServeCmd(version string, assets ServeAssets) *cobra.Command {
	return &cobra.Command{
		Use:   "serve",
		Short: "启动 HTTP 服务（SQLite + API + 前端）",
		RunE: func(cmd *cobra.Command, _ []string) error {
			logx.ConfigureFromEnv()
			cfg := config.Load()
			application, err := app.New(context.Background(), cfg, version, assets.SPA)
			if err != nil {
				return err
			}
			defer application.Close()

			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			if err := application.Run(ctx); err != nil {
				slog.Error("服务退出", slog.Any("err", err))
			}
			return nil
		},
	}
}
