package main

import (
	"fmt"
	"os"

	"kanso/apps/landing"
	"kanso/internal/cli"
	"kanso/web"
)

// version 由构建时注入（-ldflags "-X main.version=..."），本地开发构建为 "dev"。
var version = "dev"

func main() {
	if err := cli.Execute(version, cli.ServeAssets{
		SPA:     web.DistFS(),
		Landing: landing.FS(),
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
