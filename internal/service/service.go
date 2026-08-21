// Package service 提供领域服务（workspace/project/column/task/label/comment/activity）。
// 所有写操作在此层完成，数据访问走 sqlc 生成的 gen 包（ADR-0004）。
package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"

	"kanso/internal/config"
	"kanso/internal/db/gen"
	"kanso/internal/realtime"
)

// ErrNotFound 表示目标实体不存在，HTTP 层映射为 404。
var ErrNotFound = errors.New("not found")

// ErrCrossProjectMove 表示把任务移动到另一项目的列（客户端错误，HTTP 层映射为 400）。
var ErrCrossProjectMove = errors.New("cross project task move")

// ErrLabelNotFound 表示创建任务时贴的标签 ID 不存在（客户端错误，HTTP 层映射为 400）。
var ErrLabelNotFound = errors.New("label not found")

// ErrForbidden indicates that the authenticated member lacks the required role.
var ErrForbidden = errors.New("forbidden")

// ErrInvalidBackup 表示备份快照缺少恢复所需的基础数据。
var ErrInvalidBackup = errors.New("invalid backup")

// ErrInvalidInput 表示请求参数或业务输入不符合领域约束。
var ErrInvalidInput = errors.New("invalid input")

// ErrConflict 表示请求与当前资源状态冲突。
var ErrConflict = errors.New("conflict")

type ErrorKind string

const (
	ErrorNotFound     ErrorKind = "not_found"
	ErrorForbidden    ErrorKind = "forbidden"
	ErrorInvalidInput ErrorKind = "invalid_input"
	ErrorConflict     ErrorKind = "conflict"
	ErrorInternal     ErrorKind = "internal"
)

// ClassifyError 将领域错误统一归类，HTTP/日志等适配层只依赖类别而不重复维护 sentinel 列表。
func ClassifyError(err error) ErrorKind {
	switch {
	case errors.Is(err, ErrNotFound):
		return ErrorNotFound
	case errors.Is(err, ErrForbidden), errors.Is(err, ErrOwnerProtected):
		return ErrorForbidden
	case errors.Is(err, ErrInvalidInput), errors.Is(err, ErrInvalidBackup),
		errors.Is(err, ErrCrossProjectMove), errors.Is(err, ErrLabelNotFound),
		errors.Is(err, ErrReservedName):
		return ErrorInvalidInput
	case errors.Is(err, ErrConflict), errors.Is(err, ErrMemberLimit):
		return ErrorConflict
	default:
		return ErrorInternal
	}
}

// Broadcaster 是实时事件广播抽象（由 httpapi 注入 Hub）。
type Broadcaster interface {
	Broadcast(projectID string, event realtime.Event)
	BroadcastAll(event realtime.Event)
}

// ctxKey 是 service 包内 context 键的私有类型，避免与其他包键冲突。
type ctxKey int

const (
	// actorCtxKey 保存当前请求的执行者名（personal 模式恒为 "Admin"；team 模式为成员名）。
	// 由 httpapi 的 actor 中间件写入，dispatch 在记录活动/广播时读取（ADR-0013 决策 5）。
	actorCtxKey ctxKey = iota
)

// ActorFromContext 返回 context 中的执行者名；未注入时回退 "Admin"（如种子流程）。
func ActorFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(actorCtxKey).(string); ok && v != "" {
		return v
	}
	return "Admin"
}

// WithActor 返回携带执行者名的 context（httpapi 中间件使用）。
func WithActor(ctx context.Context, actor string) context.Context {
	return context.WithValue(ctx, actorCtxKey, actor)
}

// Service 持有数据库句柄与运行模式，提供全部领域操作。
type Service struct {
	db                 *sql.DB
	broadcaster        Broadcaster
	mode               config.Mode
	backupDir          string
	autoArchiveMu      sync.RWMutex
	autoArchiveEnabled bool
	autoArchiveDays    int
}

// New 构造 Service（mode 决定认证与归属语义，ADR-0013）。
func New(database *sql.DB, mode config.Mode) *Service {
	return &Service{
		db:                 database,
		mode:               mode,
		autoArchiveEnabled: config.DefaultAutoArchiveEnabled,
		autoArchiveDays:    config.DefaultAutoArchiveAfterDays,
	}
}

// SetAutoArchiveSettings 更新自动归档运行时配置。设置页保存后立即调用，
// 无需重启即可让后台归档循环使用新值。
func (s *Service) SetAutoArchiveSettings(enabled bool, days int) {
	s.autoArchiveMu.Lock()
	defer s.autoArchiveMu.Unlock()
	s.autoArchiveEnabled = enabled
	s.autoArchiveDays = config.NormalizeAutoArchiveAfterDays(days)
}

// AutoArchiveSettings 返回自动归档运行时配置的快照。
func (s *Service) AutoArchiveSettings() (enabled bool, days int) {
	s.autoArchiveMu.RLock()
	defer s.autoArchiveMu.RUnlock()
	return s.autoArchiveEnabled, s.autoArchiveDays
}

// Ping 检查服务依赖的 SQLite 数据库是否可用，供就绪探针使用。
func (s *Service) Ping(ctx context.Context) error {
	if err := s.db.PingContext(ctx); err != nil {
		return fmt.Errorf("数据库不可用: %w", err)
	}
	return nil
}

// Mode 由字段持有（构造时注入），暂无外部读取方；如需暴露可在此添加。
// （2026-08：S-11 清理时确认无调用者，保留字段不保留方法。）

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

// beginTx 开启写事务并绑定查询句柄（全部写操作的统一起始头；只读导出保留独立 TX）。
func beginTx(ctx context.Context, db *sql.DB) (*sql.Tx, *gen.Queries, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("开启事务失败: %w", err)
	}
	return tx, gen.New(tx), nil
}

// mapNoRows 把 sql.ErrNoRows（:one 查询未命中）映射为 ErrNotFound。
func mapNoRows(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
