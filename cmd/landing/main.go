// Command landing 单独预览静态落地页（apps/landing）：只做文件服务，
// 不读配置文件、不连数据库、不要访问密钥——看营销页不该要求整套应用栈跑起来。
package main

import (
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"kanso/apps/landing"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:4173", "监听地址")
	flag.Parse()

	server := &http.Server{Addr: *addr, Handler: http.FileServer(http.FS(landing.FS()))}
	slog.Info("落地页预览已启动", "addr", *addr, "url", "http://"+displayAddr(*addr))
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("落地页服务退出", "err", err)
		os.Exit(1)
	}
}

// displayAddr 把 ":4173" 这类只有端口的地址补成能直接打开的地址。
func displayAddr(addr string) string {
	if strings.HasPrefix(addr, ":") {
		return "127.0.0.1" + addr
	}
	return addr
}
