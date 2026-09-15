// Package cli 实现 kanso 命令行：serve 启动服务，其余子命令通过 HTTP 操作已运行实例。
package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Options 保存客户端全局 flag，由 Root 注入各 HTTP 子命令。
type Options struct {
	Addr    string
	Key     string
	JSON    bool
	Version string
	// ConfigPath 仅测试覆盖；空则使用默认 ~/.config/kanso/cli.json。
	ConfigPath string
}

// NewRoot 构建根命令（含 serve 与 HTTP 客户端子命令）。
func NewRoot(version string, assets ServeAssets) (*cobra.Command, *Options) {
	opts := &Options{Version: version}
	root := &cobra.Command{
		Use:           "kanso",
		Short:         "Kanso：看板服务与命令行客户端",
		Long:          "kanso serve 启动 HTTP 服务；其余子命令通过 API 操作已运行的实例。",
		SilenceUsage:  true,
		SilenceErrors: true,
		Version:       version,
	}
	root.PersistentFlags().StringVar(&opts.Addr, "addr", envOr("KANSO_API_URL", "http://127.0.0.1:8080"), "API 地址（客户端子命令）")
	root.PersistentFlags().StringVar(&opts.Key, "key", "", "访问密钥（覆盖环境变量与本地配置）")
	root.PersistentFlags().BoolVar(&opts.JSON, "json", false, "以 JSON 输出原始响应")

	root.AddCommand(newServeCmd(version, assets))
	root.AddCommand(newHealthCmd(opts))
	root.AddCommand(newLoginCmd(opts))
	root.AddCommand(newWhoamiCmd(opts))
	root.AddCommand(newWorkspaceCmd(opts))
	root.AddCommand(newProjectCmd(opts))
	root.AddCommand(newBoardCmd(opts))
	root.AddCommand(newTaskCmd(opts))
	root.AddCommand(newLabelCmd(opts))
	root.AddCommand(newMilestoneCmd(opts))
	root.AddCommand(newMCPCmd(opts))
	return root, opts
}

// Execute 运行 CLI；失败时由调用方决定退出码。
func Execute(version string, assets ServeAssets) error {
	root, _ := NewRoot(version, assets)
	return root.Execute()
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// resolveKey 优先级：--key > KANSO_ACCESS_KEY > 配置文件。
func (o *Options) resolveKey() (string, error) {
	if o.Key != "" {
		return o.Key, nil
	}
	if v := os.Getenv("KANSO_ACCESS_KEY"); v != "" {
		return v, nil
	}
	cfg, err := loadConfig(o.ConfigPath)
	if err != nil {
		return "", err
	}
	if cfg.AccessKey == "" {
		return "", fmt.Errorf("未登录：请先运行 kanso login --key <access-key>，或设置 --key / KANSO_ACCESS_KEY")
	}
	return cfg.AccessKey, nil
}

func (o *Options) newClient(needAuth bool) (*Client, error) {
	key := ""
	if needAuth {
		var err error
		key, err = o.resolveKey()
		if err != nil {
			return nil, err
		}
	}
	return NewClient(o.Addr, key), nil
}
