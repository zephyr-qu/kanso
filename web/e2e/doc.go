// Package e2e 使本目录成为合法 Go 包，避免 Go 工具链将仅含 .spec.ts 的
// 目录视为"no Go files"而报 build failed。本目录承载 Playwright E2E 测试。
package e2e
