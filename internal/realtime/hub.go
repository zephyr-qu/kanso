// Package realtime 提供单实例内存 WebSocket hub（ADR-0005：无 Redis，进程内广播）。
// 连接按项目订阅；项目级事件按项目路由，工作区级事件（标签）广播给全部连接。
package realtime

import (
	"encoding/json"
	"sync"
)

// Event 是所有广播事件的统一载荷。
type Event struct {
	Type        string `json:"type"`
	ProjectID   string `json:"projectId,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	EntityID    string `json:"entityId,omitempty"`
}

// Hub 管理所有 WebSocket 订阅者并转发事件。
type Hub struct {
	mu        sync.Mutex
	byProject map[string]map[chan []byte]struct{}
	all       map[chan []byte]struct{}
}

// NewHub 构造空 Hub。
func NewHub() *Hub {
	return &Hub{
		byProject: make(map[string]map[chan []byte]struct{}),
		all:       make(map[chan []byte]struct{}),
	}
}

// Subscribe 注册订阅者（订阅 projectID），返回其发送通道。
func (h *Hub) Subscribe(projectID string) chan []byte {
	send := make(chan []byte, 32)
	h.mu.Lock()
	defer h.mu.Unlock()
	h.all[send] = struct{}{}
	if _, ok := h.byProject[projectID]; !ok {
		h.byProject[projectID] = make(map[chan []byte]struct{})
	}
	h.byProject[projectID][send] = struct{}{}
	return send
}

// Unsubscribe 注销订阅者。
func (h *Hub) Unsubscribe(projectID string, send chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.all, send)
	if conns, ok := h.byProject[projectID]; ok {
		delete(conns, send)
		if len(conns) == 0 {
			delete(h.byProject, projectID)
		}
	}
}

// Broadcast 向订阅指定项目的连接广播事件。
func (h *Hub) Broadcast(projectID string, event Event) {
	h.mu.Lock()
	targets := make([]chan []byte, 0, len(h.byProject[projectID]))
	for c := range h.byProject[projectID] {
		targets = append(targets, c)
	}
	h.mu.Unlock()
	h.send(targets, event)
}

// BroadcastAll 向全部连接广播（工作区级事件）。
func (h *Hub) BroadcastAll(event Event) {
	h.mu.Lock()
	targets := make([]chan []byte, 0, len(h.all))
	for c := range h.all {
		targets = append(targets, c)
	}
	h.mu.Unlock()
	h.send(targets, event)
}

func (h *Hub) send(targets []chan []byte, event Event) {
	payload, err := json.Marshal(event)
	if err != nil {
		return
	}
	for _, c := range targets {
		select {
		case c <- payload:
		default:
			// 发送缓冲满：丢弃该事件（客户端下次刷新会拉取真值）。
		}
	}
}
