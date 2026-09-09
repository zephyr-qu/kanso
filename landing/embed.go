// Package landing embeds the standalone marketing homepage (HTML + CSS + fonts).
// It is served at "/" in production and previewed independently of the SPA.
package landing

import (
	"embed"
	"io/fs"
)

//go:embed index.html style.css favicon.svg fonts
var files embed.FS

// FS returns the embedded landing filesystem.
func FS() fs.FS {
	return files
}
