// Package id 提供全局唯一 ID 生成（32 字符随机 hex，无外部依赖）。
package id

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// readRandom 抽象随机源（生产即 crypto/rand.Read）；测试可替换以覆盖失败分支。
var readRandom = rand.Read

// New 生成一个新的 32 字符随机 hex ID。
func New() (string, error) {
	b := make([]byte, 16)
	if _, err := readRandom(b); err != nil {
		return "", fmt.Errorf("生成 ID 失败: %w", err)
	}
	return hex.EncodeToString(b), nil
}
