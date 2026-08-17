// Package tests 使本目录成为合法 Go 包，避免 Go 工具链将仅含 .test.ts 的
// 目录视为"no Go files"而报 build failed。本目录实际承载前端 vitest 测试。
package tests
