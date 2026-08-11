// Package service 提供领域服务（workspace/project/column/task/label/comment/activity）。
// 所有写操作在此层完成，数据访问走 sqlc 生成的 gen 包（ADR-0004）。
package service

import (
	"database/sql"
	"errors"

	"kanso/internal/realtime"
)

// ErrNotFound 表示目标实体不存在，HTTP 层映射为 404。
var ErrNotFound = errors.New("not found")

// ErrCrossProjectMove 表示把任务移动到另一项目的列（客户端错误，HTTP 层映射为 400）。
var ErrCrossProjectMove = errors.New("cross project task move")

// Broadcaster 是实时事件广播抽象（由 httpapi 注入 Hub）。
type Broadcaster interface {
	Broadcast(projectID string, event realtime.Event)
	BroadcastAll(event realtime.Event)
}

// Service 持有数据库句柄，提供全部领域操作。
type Service struct {
	db          *sql.DB
	broadcaster Broadcaster
}

// New 构造 Service。
func New(database *sql.DB) *Service {
	return &Service{db: database}
}

// SetBroadcaster 注入实时广播器（nil 安全）。
func (s *Service) SetBroadcaster(b Broadcaster) {
	s.broadcaster = b
}

// emit 向项目广播实时事件。
func (s *Service) emit(projectID, eventType, entityID string) {
	if s.broadcaster == nil {
		return
	}
	s.broadcaster.Broadcast(projectID, realtime.Event{
		Type:      eventType,
		ProjectID: projectID,
		EntityID:  entityID,
	})
}

// emitAll 向全部连接广播（工作区级事件）。
func (s *Service) emitAll(eventType, workspaceID, entityID string) {
	if s.broadcaster == nil {
		return
	}
	s.broadcaster.BroadcastAll(realtime.Event{
		Type:        eventType,
		WorkspaceID: workspaceID,
		EntityID:    entityID,
	})
}

// mapNoRows 把 sql.ErrNoRows（:one 查询未命中）映射为 ErrNotFound。
func mapNoRows(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

