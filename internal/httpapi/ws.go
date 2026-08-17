package httpapi

import (
	"net/http"
	"sync"

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
		// 按成员表校验密钥（personal = 单一 owner，owner.access_key = KANSO_ACCESS_KEY）。
		authed := a.svc.VerifyKey(r.Context(), key)
		if !authed {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			// W-5 收紧：密钥经查询参数传输，不再接受任意 http(s) Origin（防跨站 WS 窃听）。
			// coder/websocket 原生放行两类请求：无 Origin（非浏览器客户端，如测试/脚本）
			// 与同源（Origin host == 请求 Host；浏览器直连或经 Vite 代理时 Host 保持浏览器 origin）。
			// 其余跨源请求必须命中 KANSO_WS_ORIGINS 白名单（e2e 已配置 Vite dev origin）。
			OriginPatterns: a.cfg.WSOrigins,
		})
		if err != nil {
			return
		}
		defer conn.CloseNow()

		ctx := r.Context()
		send := hub.Subscribe(projectID)
		defer hub.Unsubscribe(projectID, send)

		// 写协程：把 hub 事件写入连接，直到读侧断开。
		// 写协程：把 hub 事件写入连接，直到读侧断开（S-13：WaitGroup 汇合，关闭确定）。
		done := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(1)
		go func() {
			defer wg.Done()
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
		wg.Wait()
	}
}
