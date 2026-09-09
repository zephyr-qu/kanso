package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config 是本地保存的 CLI 配置（不含服务端运行态）。
type Config struct {
	AccessKey string `json:"accessKey,omitempty"`
	Addr      string `json:"addr,omitempty"`
}

func defaultConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("定位配置目录失败: %w", err)
	}
	return filepath.Join(dir, "kanso", "cli.json"), nil
}

func resolveConfigPath(override string) (string, error) {
	if override != "" {
		return override, nil
	}
	return defaultConfigPath()
}

func loadConfig(override string) (Config, error) {
	path, err := resolveConfigPath(override)
	if err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Config{}, nil
		}
		return Config{}, fmt.Errorf("读取配置失败: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("解析配置失败: %w", err)
	}
	return cfg, nil
}

func saveConfig(override string, cfg Config) error {
	path, err := resolveConfigPath(override)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("编码配置失败: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("写入配置失败: %w", err)
	}
	return nil
}
