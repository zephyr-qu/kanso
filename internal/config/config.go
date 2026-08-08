package config

import "os"

// Config 汇总运行配置，全部来自环境变量。
type Config struct {
	// Addr 是 HTTP 监听地址（Web + API 同一端口）。
	Addr string
	// AccessKey 是共享访问密钥；为空时由 main 随机生成并打印。
	AccessKey string
	// DataDir 是 SQLite 数据文件目录。
	DataDir string
}

func Load() Config {
	return Config{
		Addr:      getenv("KANSO_ADDR", ":8080"),
		AccessKey: os.Getenv("KANSO_ACCESS_KEY"),
		DataDir:   getenv("KANSO_DATA_DIR", "./data"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
