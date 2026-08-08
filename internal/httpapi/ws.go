package httpapi

import (
	"crypto/subtle"
	"net/http"

	"github.com/coder/websocket"

	"kanso/internal/realtime"
)

// handleWS 升级 WebSocket 连接并订阅项目。
// 浏览器 WebSocket 无法自定义请求头，因此密钥经查询参数传入（仅本端点；
// 其余端点仍走 Authorization 头，见 auth.Middleware）。
// 连接按 project 订阅，服务端写操作经 hub 广播，客户端收到后 invalidate 查询。
func (a *API) handleWS(hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := r.URL.Query().Get("project")
		if projectID == "" {
			writeError(w, http.StatusBadRequest, "缺少 project 参数")
			return
		}
		key := r.URL.Query().Get("key")
		if subtle.ConstantTimeCompare([]byte(key), []byte(a.cfg.AccessKey)) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: []string{"http://*", "https://*"},
		})
		if err != nil {
			return
		}
		defer conn.CloseNow()

		ctx := r.Context()
		send := hub.Subscribe(projectID)
		defer hub.Unsubscribe(projectID, send)

		// 写协程：把 hub 事件写入连接，直到读侧断开。
		done := make(chan struct{})
		go func() {
			for {
				select {
				case <-done:
					return
				case msg := <-send:
					if err := conn.Write(ctx, websocket.MessageText, msg); err != nil {
						return
					}
				}
			}
		}()

		// 读循环：保持连接直到客户端断开（客户端消息忽略，实时是单向推送）。
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				break
			}
		}
		close(done)
	}
}
