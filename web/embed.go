// Package web exposes the production frontend assets to the Go server.
package web

import (
	"embed"
	"io/fs"
)

// dist contains the Vite production output. The Docker build populates this
// directory before compiling the Go binary; the tracked .gitkeep keeps local
// Go tooling usable before the first frontend build.
//
//go:embed dist/**
var dist embed.FS

// DistFS returns the embedded frontend filesystem rooted at web/dist.
func DistFS() fs.FS {
	root, err := fs.Sub(dist, "dist")
	if err != nil {
		panic("embedded web/dist is missing")
	}
	return root
}
