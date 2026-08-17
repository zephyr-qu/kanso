package config

import (
	"encoding/json"
	"log"
	"os"
	"strings"
)

// Mode 是运行模式（ADR-0013）：personal 个人模式 / team 团队模式。
type Mode string

const (
	ModePersonal Mode = "personal"
	ModeTeam     Mode = "team"
)

// ParseMode 解析 KANSO_MODE；空或非法值回退 personal（默认）。
func ParseMode(v string) Mode {
	switch Mode(v) {
	case ModeTeam:
		return ModeTeam
	default:
		return ModePersonal
	}
}

// DefaultConfigFile 是持久化配置文件默认路径（可用 KANSO_CONFIG_FILE 覆盖）。
// 保存后重启生效（addr/dataDir 为启动参数），accessKey 保存时热同步成员表。
const DefaultConfigFile = "kanso-config.json"

// FileConfig 是持久化到磁盘的运行配置（JSON），不含运行模式（模式仅由 KANSO_MODE 启动时决定）。
// 优先级：环境变量 > 配置文件 > 内置默认值。
type FileConfig struct {
	Addr      string `json:"addr"`
	DataDir   string `json:"dataDir"`
	AccessKey string `json:"accessKey"`
	// WSOrigins 逗号分隔的 WS 白名单。
	WSOrigins string `json:"wsOrigins"`
}

// ConfigFilePath 返回配置文件路径：KANSO_CONFIG_FILE 显式指定时用之，否则默认 ./kanso-config.json。
func ConfigFilePath() string {
	if v := os.Getenv("KANSO_CONFIG_FILE"); v != "" {
		return v
	}
	return DefaultConfigFile
}

// ReadFile 读取配置文件；文件不存在时返回零值（nil 错误），读取或解析失败返回错误。
func ReadFile(path string) (FileConfig, error) {
	var fc FileConfig
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fc, nil
		}
		return fc, err
	}
	if err := json.Unmarshal(b, &fc); err != nil {
		return fc, err
	}
	return fc, nil
}

// SaveFile 原子写入配置文件（先写临时文件再 rename，0600 权限防密钥泄露）。
func SaveFile(path string, fc FileConfig) error {
	b, err := json.MarshalIndent(fc, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Config 汇总运行配置：环境变量优先，配置文件次之，内置默认兜底。
type Config struct {
	// Addr 是 HTTP 监听地址（Web + API 同一端口）。
	Addr string
	// AccessKey 是共享访问密钥；为空时由 main 随机生成并打印。
	AccessKey string
	// DataDir 是 SQLite 数据文件目录。
	DataDir string
	// Mode 是运行模式：personal（默认）/ team（ADR-0013）。
	Mode Mode
	// WSOrigins 是 WebSocket 升级允许的 Origin 白名单（KANSO_WS_ORIGINS，逗号分隔）。
	// 空时仅放行同源（或缺失 Origin 的）连接；浏览器经 Vite 代理连接时 Origin 与请求
	// Host 一致，天然命中同源分支，无需配置。
	WSOrigins []string
}

func Load() Config {
	fileCfg := FileConfig{}
	if fc, err := ReadFile(ConfigFilePath()); err != nil {
		// 配置文件缺失/损坏不阻断启动：回退内置默认，并打警告便于发现。
		log.Printf("⚠️ 读取配置文件失败（使用内置默认）: %v", err)
	} else {
		fileCfg = fc
	}
	return Config{
		Addr:      firstNonEmpty(os.Getenv("KANSO_ADDR"), fileCfg.Addr, ":8080"),
		AccessKey: firstNonEmpty(os.Getenv("KANSO_ACCESS_KEY"), fileCfg.AccessKey),
		DataDir:   firstNonEmpty(os.Getenv("KANSO_DATA_DIR"), fileCfg.DataDir, "./data"),
		Mode:      ParseMode(os.Getenv("KANSO_MODE")),
		WSOrigins: parseOrigins(firstNonEmpty(os.Getenv("KANSO_WS_ORIGINS"), fileCfg.WSOrigins)),
	}
}

// firstNonEmpty 返回第一个非空值；全为空返回 ""。
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// parseOrigins 解析逗号分隔的 Origin 白名单（忽略空项与首尾空白）。
func parseOrigins(v string) []string {
	var out []string
	for _, part := range strings.Split(v, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
