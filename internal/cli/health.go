package cli

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
)

func newHealthCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "health",
		Short: "检查服务健康状态（无需密钥）",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(false)
			if err != nil {
				return err
			}
			var health map[string]any
			raw, err := c.DoRaw(context.Background(), "GET", "/api/health", nil, &health)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "ok=%v name=%v version=%v mode=%v",
				health["ok"], health["name"], health["version"], health["mode"])
			return nil
		},
	}
}

func newLoginCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "login",
		Short: "校验访问密钥并写入本地配置",
		RunE: func(cmd *cobra.Command, _ []string) error {
			key := opts.Key
			if key == "" {
				key = envOr("KANSO_ACCESS_KEY", "")
			}
			if key == "" {
				return fmt.Errorf("请提供 --key 或设置 KANSO_ACCESS_KEY")
			}
			c := NewClient(opts.Addr, "")
			var body map[string]any
			if err := c.DoJSON(context.Background(), "POST", "/api/auth/verify", map[string]string{"key": key}, &body); err != nil {
				return err
			}
			if body["ok"] != true {
				return fmt.Errorf("密钥无效")
			}
			cfg, err := loadConfig(opts.ConfigPath)
			if err != nil {
				return err
			}
			cfg.AccessKey = key
			cfg.Addr = opts.Addr
			if err := saveConfig(opts.ConfigPath, cfg); err != nil {
				return err
			}
			path, _ := resolveConfigPath(opts.ConfigPath)
			writeLine(cmd.OutOrStdout(), "已登录，配置写入 %s", path)
			return nil
		},
	}
}

func newWhoamiCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "显示当前登录成员",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var me struct {
				Member struct {
					ID   string `json:"id"`
					Name string `json:"name"`
					Role string `json:"role"`
				} `json:"member"`
				Mode string `json:"mode"`
			}
			raw, err := c.DoRaw(context.Background(), "GET", "/api/me", nil, &me)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "id=%s name=%s role=%s mode=%s",
				me.Member.ID, me.Member.Name, me.Member.Role, me.Mode)
			return nil
		},
	}
}
