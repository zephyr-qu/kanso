package config

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strconv"
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
// 保存后重启生效（addr/dataDir 为启动参数）。
const DefaultConfigFile = "kanso-config.json"

const (
	// DefaultAutoArchiveEnabled 表示自动归档默认开启；需要关闭时通过配置文件设置为 false。
	DefaultAutoArchiveEnabled   = true
	DefaultAutoArchiveAfterDays = 7
	MaxAutoArchiveAfterDays     = 3650
)

// FileConfig 是持久化到磁盘的运行配置（JSON），不含运行模式（模式仅由 KANSO_MODE 启动时决定）。
// 优先级：环境变量 > 配置文件 > 内置默认值。
type FileConfig struct {
	Addr      string `json:"addr"`
	DataDir   string `json:"dataDir"`
	AccessKey string `json:"accessKey"`
	// WSOrigins 逗号分隔的 WS 白名单。
	WSOrigins string `json:"wsOrigins"`
	// AutoArchiveEnabled 控制是否自动归档已完成任务；指针用于区分缺省值与显式 false。
	AutoArchiveEnabled *bool `json:"autoArchiveEnabled"`
	// AutoArchiveAfterDays 是任务进入完成列后保留的天数。
	AutoArchiveAfterDays int `json:"autoArchiveAfterDays"`
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
	// AccessKey 是共享访问密钥；为空时由应用生命周期层随机生成并打印。
	AccessKey string
	// DataDir 是 SQLite 数据文件目录。
	DataDir string
	// Mode 是运行模式：personal（默认）/ team（ADR-0013）。
	Mode Mode
	// WSOrigins 是 WebSocket 升级允许的 Origin 白名单（KANSO_WS_ORIGINS，逗号分隔）。
	// 空时仅放行同源（或缺失 Origin 的）连接；浏览器经 Vite 代理连接时 Origin 与请求
	// Host 一致，天然命中同源分支，无需配置。
	WSOrigins []string
	// AutoArchiveEnabled 控制是否自动归档已完成任务。
	AutoArchiveEnabled bool
	// AutoArchiveAfterDays 是任务进入完成列后保留的天数。
	AutoArchiveAfterDays int
}

// Validate 检查启动所需的运行配置，避免服务已初始化一半才因地址或数据目录失败。
func Validate(cfg Config) error {
	if strings.TrimSpace(cfg.Addr) == "" {
		return fmt.Errorf("地址不能为空")
	}
	if _, port, err := net.SplitHostPort(cfg.Addr); err != nil {
		return fmt.Errorf("监听地址 %q 无效，应为 host:port: %w", cfg.Addr, err)
	} else if n, err := strconv.Atoi(port); err != nil || n < 0 || n > 65535 {
		return fmt.Errorf("监听端口 %q 无效，应为 0-65535", port)
	}
	if cfg.DataDir == "" || strings.ContainsRune(cfg.DataDir, '\x00') {
		return fmt.Errorf("数据目录不能为空且不能包含 NUL 字符")
	}
	if cfg.Mode != ModePersonal && cfg.Mode != ModeTeam {
		return fmt.Errorf("运行模式 %q 无效，应为 personal 或 team", cfg.Mode)
	}
	return validateDataDir(cfg.DataDir)
}

func validateDataDir(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("解析数据目录 %q 失败: %w", path, err)
	}
	info, err := os.Stat(abs)
	if err == nil {
		if !info.IsDir() {
			return fmt.Errorf("数据目录 %q 已存在但不是目录", path)
		}
		return nil
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("检查数据目录 %q 失败: %w", path, err)
	}
	// 目录尚不存在时，确认其最近的已存在父目录可作为创建起点；实际创建仍由 db.Open 完成。
	parent := filepath.Dir(abs)
	for {
		info, statErr := os.Stat(parent)
		if statErr == nil {
			if !info.IsDir() {
				return fmt.Errorf("数据目录父路径 %q 不是目录", parent)
			}
			return nil
		}
		if !os.IsNotExist(statErr) {
			return fmt.Errorf("检查数据目录父路径 %q 失败: %w", parent, statErr)
		}
		next := filepath.Dir(parent)
		if next == parent {
			return fmt.Errorf("数据目录 %q 没有可用的父目录", path)
		}
		parent = next
	}
}

func Load() Config {
	fileCfg := FileConfig{}
	if fc, err := ReadFile(ConfigFilePath()); err != nil {
		// 配置文件缺失/损坏不阻断启动：回退内置默认，并打警告便于发现。
		log.Printf("⚠️ 读取配置文件失败（使用内置默认）: %v", err)
	} else {
		fileCfg = fc
	}
	autoArchiveAfterDays := fileCfg.AutoArchiveAfterDays
	if autoArchiveAfterDays <= 0 {
		autoArchiveAfterDays = DefaultAutoArchiveAfterDays
	}
	autoArchiveEnabled := DefaultAutoArchiveEnabled
	if fileCfg.AutoArchiveEnabled != nil {
		autoArchiveEnabled = *fileCfg.AutoArchiveEnabled
	}
	return Config{
		Addr:                 firstNonEmpty(os.Getenv("KANSO_ADDR"), fileCfg.Addr, ":8080"),
		AccessKey:            firstNonEmpty(os.Getenv("KANSO_ACCESS_KEY"), fileCfg.AccessKey),
		DataDir:              firstNonEmpty(os.Getenv("KANSO_DATA_DIR"), fileCfg.DataDir, "./data"),
		Mode:                 ParseMode(os.Getenv("KANSO_MODE")),
		WSOrigins:            parseOrigins(firstNonEmpty(os.Getenv("KANSO_WS_ORIGINS"), fileCfg.WSOrigins)),
		AutoArchiveEnabled:   autoArchiveEnabled,
		AutoArchiveAfterDays: autoArchiveAfterDays,
	}
}

// NormalizeAutoArchiveAfterDays 兼容旧配置文件中缺失的时长字段。
func NormalizeAutoArchiveAfterDays(days int) int {
	if days <= 0 {
		return DefaultAutoArchiveAfterDays
	}
	return days
}

// ValidAutoArchiveAfterDays 判断自动归档时长是否在可接受范围内。
func ValidAutoArchiveAfterDays(days int) bool {
	return days >= 1 && days <= MaxAutoArchiveAfterDays
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
