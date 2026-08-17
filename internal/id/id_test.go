// Package id 测试：随机 ID 生成（正常路径 + 随机源失败路径）。
package id

import (
	"encoding/hex"
	"errors"
	"testing"
)

func TestNew(t *testing.T) {
	got, err := New()
	if err != nil {
		t.Fatalf("New 不应报错: %v", err)
	}
	if len(got) != 32 {
		t.Fatalf("ID 应为 32 字符，实际 %d: %q", len(got), got)
	}
	if _, err := hex.DecodeString(got); err != nil {
		t.Fatalf("ID 应为合法 hex: %v", err)
	}
}

func TestNewUnique(t *testing.T) {
	a, err := New()
	if err != nil {
		t.Fatalf("New 不应报错: %v", err)
	}
	b, err := New()
	if err != nil {
		t.Fatalf("New 不应报错: %v", err)
	}
	if a == b {
		t.Fatalf("两次生成的 ID 不应相同: %q", a)
	}
}

func TestNewRandError(t *testing.T) {
	// 替换 readRandom 模拟随机源失败，覆盖错误包装分支。
	old := readRandom
	t.Cleanup(func() { readRandom = old })
	readRandom = func([]byte) (int, error) {
		return 0, errors.New("模拟随机源故障")
	}

	got, err := New()
	if err == nil {
		t.Fatalf("随机源失败时 New 应返回错误，实际 nil（id=%q）", got)
	}
}
