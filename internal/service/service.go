// Package service 提供领域服务（workspace/project/column/task/label/comment/activity）。
// 所有写操作在此层完成，数据访问走 sqlc 生成的 gen 包（ADR-0004）。
package service

import (
	"database/sql"
	"errors"
)

// ErrNotFound 表示目标实体不存在，HTTP 层映射为 404。
var ErrNotFound = errors.New("not found")

// mapNoRows 把 sql.ErrNoRows（:one 查询未命中）映射为 ErrNotFound。
func mapNoRows(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// Service 持有数据库句柄，提供全部领域操作。
type Service struct {
	db *sql.DB
}

// New 构造 Service。
func New(database *sql.DB) *Service {
	return &Service{db: database}
}
