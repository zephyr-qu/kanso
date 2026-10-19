// 首启向导的页面与本地服务（M6-9）。
//
// 为什么是 HTML 而不是 MyGo 的 ui：ui 是自绘控件，长得像通用桌面程序；kanso 的外观定义在
// web/src 的 design token 与组件皮肤里（暖色纸感背景、焦橙强调、Noto Serif/IBM Plex Mono）。
// 所以向导页面直接引用 app 自己编译出来的样式表——同一套 token、同一套字体、同一套组件皮肤，
// 于是「第一眼」就是产品本身的样子，也不必把样式表抄一遍。
//
// 页面由一个只在向导期间存在的回环服务提供（监听 127.0.0.1 的随机端口）：
//
//	GET  /           向导页面
//	GET  /assets/*   web/dist 里的构建产物（样式表与字体）
//	POST /__submit   提交模式与密钥，成功后回调 onDone 启动服务与主窗口
//
// 提交带一次性令牌（页面上写在 body 的 data-token 里），防止本机其它程序顺手打进来。
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	// setupSubmitPath 是提交入口；带前缀是为了不与 app 的路由撞车。
	setupSubmitPath = "/__submit"
	// setupTokenHeader 是一次性令牌的头名。
	setupTokenHeader = "X-Kanso-Setup"
	// setupBodyLimit 限制提交体积（只有模式与密钥）。
	setupBodyLimit = 8 << 10
	// setupHandoffDelay 让响应先回给页面，再启动服务与主窗口。
	setupHandoffDelay = 120 * time.Millisecond
)

// setupServer 是向导期间的回环服务。
type setupServer struct {
	url  string
	srv  *http.Server
	done chan struct{}
	once sync.Once
}

// startSetupServer 起一个只服务向导页面的回环 HTTP 服务。
func startSetupServer(dist fs.FS, dataDir string, store secretStore, initialKey string, onDone func(setupResult)) (*setupServer, error) {
	token, err := newAccessKey()
	if err != nil {
		return nil, err
	}
	page, err := template.New("setup").Parse(setupPageHTML)
	if err != nil {
		return nil, fmt.Errorf("解析向导页面失败: %w", err)
	}
	data := setupPageData{
		StyleHref: findAppStylesheet(dist),
		Key:       initialKey,
		Token:     token,
	}

	s := &setupServer{done: make(chan struct{})}
	mux := http.NewServeMux()
	// 构建产物：样式表与其引用的字体（CSS 里的 url() 是相对路径，所以挂在 /assets/ 下）。
	mux.Handle("/assets/", http.FileServer(http.FS(dist)))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		if err := page.Execute(w, data); err != nil {
			slog.Warn("输出向导页面失败", slog.Any("err", err))
		}
	})
	mux.HandleFunc(setupSubmitPath, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "只接受 POST", http.StatusMethodNotAllowed)
			return
		}
		if r.Header.Get(setupTokenHeader) != token {
			http.Error(w, "令牌无效", http.StatusForbidden)
			return
		}
		var req struct {
			Mode string `json:"mode"`
			Key  string `json:"key"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, setupBodyLimit)).Decode(&req); err != nil {
			writeSetupJSON(w, http.StatusBadRequest, false, "请求格式不对")
			return
		}
		mode, ok := parseSetupMode(req.Mode)
		if !ok {
			writeSetupJSON(w, http.StatusBadRequest, false, "运行模式无效")
			return
		}
		res := setupResult{Mode: mode, Key: req.Key}
		if err := completeSetup(dataDir, store, res); err != nil {
			slog.Error("保存首启设置失败", slog.Any("err", err))
			writeSetupJSON(w, http.StatusBadRequest, false, err.Error())
			return
		}
		writeSetupJSON(w, http.StatusOK, true, "")
		if !s.claim() {
			return // 重复提交：设置已保存，不再启动第二次
		}
		go func() {
			time.Sleep(setupHandoffDelay)
			onDone(res)
		}()
	})

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("向导服务监听失败: %w", err)
	}
	s.srv = &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	s.url = "http://" + ln.Addr().String() + "/"
	go func() {
		if err := s.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("向导服务异常退出", slog.Any("err", err))
		}
	}()
	slog.Info("首启向导页面已就绪", slog.String("url", s.url), slog.Bool("appStyles", data.StyleHref != ""))
	return s, nil
}

// submitted 在用户点「开始使用」并保存成功后关闭。
func (s *setupServer) submitted() <-chan struct{} { return s.done }

// claim 标记首次提交成功；重复提交返回 false。
func (s *setupServer) claim() bool {
	claimed := false
	s.once.Do(func() {
		claimed = true
		close(s.done)
	})
	return claimed
}

// close 停掉向导服务（向导窗口关掉后调用）。
func (s *setupServer) close() {
	if s == nil || s.srv == nil {
		return
	}
	if err := s.srv.Close(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Warn("关闭向导服务失败", slog.Any("err", err))
	}
}

// writeSetupJSON 统一提交入口的响应形态：{"ok":bool,"error":"..."}。
func writeSetupJSON(w http.ResponseWriter, status int, ok bool, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		OK    bool   `json:"ok"`
		Error string `json:"error,omitempty"`
	}{OK: ok, Error: message})
}

// findAppStylesheet 找出 web/dist 里 app 编译出的样式表（文件名带构建哈希）。
// 拿不到（未构建前端的占位 dist）时返回空串，页面会退回到内置的最小样式。
func findAppStylesheet(dist fs.FS) string {
	matches, err := fs.Glob(dist, "assets/index-*.css")
	if err != nil || len(matches) == 0 {
		return ""
	}
	sort.Strings(matches)
	return "/" + strings.TrimPrefix(matches[len(matches)-1], "/")
}

// setupPageData 是向导页面的模板数据。
type setupPageData struct {
	// StyleHref 是 app 样式表的 URL；空表示没有构建产物。
	StyleHref string
	// Key 是预填的访问密钥。
	Key string
	// Token 是提交用的一次性令牌。
	Token string
}

// setupPageHTML 是向导页面。布局与文案独立，配色/字体/圆角全部来自 app 的样式表；
// 样式表缺失时由 html.no-app-css 里的兜底变量补上（只有这一种情况会用到硬编码色值）。
const setupPageHTML = `<!doctype html>
<html lang="zh-CN"{{if not .StyleHref}} class="no-app-css"{{end}}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kanso 首次设置</title>
<script>
  // 与 app 一致：默认跟随系统深浅色（web/src/lib/theme.ts 里 system 的处理）。
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
</script>
{{if .StyleHref}}<link rel="stylesheet" href="{{.StyleHref}}">{{end}}
<style>
  * { box-sizing: border-box; }

  html, body { height: 100%; }

  body {
    margin: 0;
    background: var(--semantic-surface-page, #f7f5f0);
    color: var(--semantic-content-primary, #37352f);
    font-family: var(--semantic-font-sans, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    overflow-y: auto;
  }

  .wizard {
    max-width: 560px;
    margin: 0 auto;
    padding: 32px 32px 24px;
    animation: wizard-in 220ms cubic-bezier(0.23, 1, 0.32, 1) both;
  }

  @keyframes wizard-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .wizard { animation: none; }
  }

  .wizard__brand { display: flex; align-items: center; gap: 9px; margin-bottom: 24px; }

  /* .kanso-login-mark 的盒模型与配色来自 app 样式表，这里只补字体（它是汉字 mark）。 */
  .wizard .kanso-login-mark {
    display: inline-flex;
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-family: var(--semantic-font-serif, Georgia, serif);
    font-size: 13px;
    font-weight: 600;
  }

  .wizard__brand-name { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }

  .wizard__title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; }

  .wizard__lede {
    margin: 8px 0 26px;
    font-size: 13px;
    color: var(--semantic-content-secondary, #6b675f);
  }

  .wizard__group { margin: 0 0 22px; }

  .wizard__label {
    display: block;
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--semantic-content-secondary, #6b675f);
  }

  .mode-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--semantic-border-default, rgba(55, 53, 47, 0.1));
    border-radius: var(--primitive-radius-lg, 8px);
    background: var(--semantic-surface-card, #fdfcf9);
    cursor: pointer;
    transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
  }

  .mode-card + .mode-card { margin-top: 8px; }

  .mode-card:hover { border-color: var(--semantic-border-strong, rgba(55, 53, 47, 0.2)); }

  .mode-card:has(input:checked) {
    border-color: var(--semantic-action-primary, #c2410c);
    background: var(--semantic-action-primary-soft, rgba(194, 65, 12, 0.09));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--semantic-action-primary, #c2410c) 12%, transparent);
  }

  .mode-card input {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    width: 15px;
    height: 15px;
    margin: 3px 0 0;
    border: 1.5px solid var(--semantic-border-strong, rgba(55, 53, 47, 0.2));
    border-radius: 9999px;
    background: var(--semantic-surface-card, #fdfcf9);
    cursor: pointer;
    transition: border-color 150ms ease, border-width 150ms ease;
  }

  .mode-card input:checked {
    border: 4px solid var(--semantic-action-primary, #c2410c);
  }

  .mode-card input:focus-visible {
    outline: none;
    box-shadow: var(--component-focus-ring, 0 0 0 3px rgba(194, 65, 12, 0.24));
  }

  .mode-card__title { display: block; font-size: 13.5px; font-weight: 600; }

  .mode-card__desc {
    display: block;
    margin-top: 2px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--semantic-content-secondary, #6b675f);
  }

  .wizard__key-row { display: flex; gap: 8px; }

  .wizard__key {
    flex: 1;
    min-width: 0;
    height: var(--component-input-height, 38px);
    padding: 0 10px;
    border: 1px solid var(--semantic-border-strong, rgba(55, 53, 47, 0.2));
    border-radius: var(--primitive-radius-md, 6px);
    background: var(--semantic-surface-card, #fdfcf9);
    color: var(--semantic-content-primary, #37352f);
    font-family: var(--semantic-font-mono, ui-monospace, monospace);
    font-size: 12.5px;
    letter-spacing: 0.01em;
  }

  .wizard__key:focus-visible {
    outline: none;
    border-color: var(--semantic-action-primary, #c2410c);
    box-shadow: var(--component-focus-ring, 0 0 0 3px rgba(194, 65, 12, 0.24));
  }

  .wizard__ghost {
    flex: 0 0 auto;
    height: var(--component-input-height, 38px);
    padding: 0 12px;
    border: 1px solid var(--semantic-border-default, rgba(55, 53, 47, 0.1));
    border-radius: var(--primitive-radius-md, 6px);
    background: transparent;
    color: var(--semantic-content-secondary, #6b675f);
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease;
  }

  .wizard__ghost:hover {
    background: var(--semantic-surface-muted, #f1eee7);
    color: var(--semantic-content-primary, #37352f);
  }

  .wizard__ghost:focus-visible {
    outline: none;
    box-shadow: var(--component-focus-ring, 0 0 0 3px rgba(194, 65, 12, 0.24));
  }

  .wizard__hint { margin: 8px 0 0; font-size: 12px; color: var(--semantic-content-tertiary, #8f8a80); }

  .wizard__submit {
    width: 100%;
    height: 38px;
    margin-top: 4px;
    border: 0;
    border-radius: var(--primitive-radius-md, 6px);
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 150ms ease, box-shadow 150ms ease;
  }

  .wizard__submit:focus-visible {
    outline: none;
    box-shadow: var(--component-focus-ring, 0 0 0 3px rgba(194, 65, 12, 0.24));
  }

  .wizard__submit[disabled] { opacity: 0.65; cursor: default; }

  .wizard__error { margin: 0 0 12px; font-size: 12.5px; color: var(--semantic-state-danger, #b3492c); }

  .wizard__starting { margin: 10px 0 0; font-size: 13px; color: var(--semantic-content-secondary, #6b675f); }

  .wizard__foot {
    margin: 22px 0 0;
    font-size: 11.5px;
    color: var(--semantic-content-tertiary, #8f8a80);
  }

  /* 只有 app 样式表缺失时（前端还没构建）才用硬编码色值兜底。 */
  html.no-app-css {
    --semantic-surface-page: #f7f5f0;
    --semantic-surface-card: #fdfcf9;
    --semantic-surface-muted: #f1eee7;
    --semantic-content-primary: #37352f;
    --semantic-content-secondary: #6b675f;
    --semantic-content-tertiary: #8f8a80;
    --semantic-content-on-primary: #fff8f0;
    --semantic-action-primary: #c2410c;
    --semantic-action-primary-hover: #9a3412;
    --semantic-action-primary-soft: rgba(194, 65, 12, 0.09);
    --semantic-border-default: rgba(55, 53, 47, 0.1);
    --semantic-border-strong: rgba(55, 53, 47, 0.2);
    --semantic-state-danger: #b3492c;
    --primitive-radius-md: 6px;
    --primitive-radius-lg: 8px;
    --component-input-height: 38px;
    --component-focus-ring: 0 0 0 3px rgba(194, 65, 12, 0.24);
  }

  html.no-app-css .kanso-login-mark,
  html.no-app-css .wizard__submit {
    background: var(--semantic-action-primary);
    color: var(--semantic-content-on-primary);
  }

  html.no-app-css .wizard__submit:hover { background: var(--semantic-action-primary-hover); }

  html.no-app-css.dark {
    --semantic-surface-page: #1d1b18;
    --semantic-surface-card: #272420;
    --semantic-surface-muted: #211f1c;
    --semantic-content-primary: #e8e3da;
    --semantic-content-secondary: #aaa39a;
    --semantic-content-tertiary: #7e776e;
    --semantic-action-primary: #e0601f;
    --semantic-action-primary-hover: #f07a35;
    --semantic-action-primary-soft: rgba(224, 96, 31, 0.18);
    --semantic-border-default: rgba(232, 227, 218, 0.12);
    --semantic-border-strong: rgba(232, 227, 218, 0.22);
    --semantic-state-danger: #cf7359;
  }
</style>
</head>
<body data-token="{{.Token}}">
<main class="wizard">
  <header class="wizard__brand">
    <span class="kanso-login-mark" aria-hidden="true">簡</span>
    <span class="wizard__brand-name">Kanso</span>
  </header>

  <h1 class="wizard__title">欢迎使用 Kanso</h1>
  <p class="wizard__lede">
    轻量的内网看板项目管理工具，单机即可运行，数据都在本机。
  </p>

  <form id="setup-form" novalidate>
    <fieldset class="wizard__group" style="border:0;padding:0;margin:0 0 22px">
      <legend class="wizard__label" style="padding:0">使用方式</legend>
      <label class="mode-card">
        <input type="radio" name="mode" value="personal" checked>
        <span>
          <span class="mode-card__title">个人使用</span>
          <span class="mode-card__desc">只服务你自己，不邀请成员。</span>
        </span>
      </label>
      <label class="mode-card">
        <input type="radio" name="mode" value="team">
        <span>
          <span class="mode-card__title">团队协作</span>
          <span class="mode-card__desc">一个工作区多人协作，可管理成员与权限。</span>
        </span>
      </label>
    </fieldset>

    <div class="wizard__group">
      <label class="wizard__label" for="access-key">访问密钥</label>
      <div class="wizard__key-row">
        <input id="access-key" class="wizard__key" value="{{.Key}}" spellcheck="false"
               autocomplete="off" autocapitalize="off" aria-describedby="key-hint">
        <button type="button" class="wizard__ghost" id="regenerate">重新生成</button>
      </div>
      <p class="wizard__hint" id="key-hint">
        浏览器、命令行与 MCP 都用这一把；已存进本机凭据管理器，下次打开不必再输。
      </p>
    </div>

    <p class="wizard__error" id="error" role="alert" hidden></p>
    <button type="submit" class="wizard__submit kanso-primary-button" id="submit">开始使用</button>
    <p class="wizard__starting" id="starting" hidden>正在启动 Kanso…</p>
  </form>

  <p class="wizard__foot">Kanso · 内网看板 · 单机部署</p>
</main>

<script>
  (function () {
    var form = document.getElementById("setup-form");
    var keyInput = document.getElementById("access-key");
    var errorBox = document.getElementById("error");
    var submitButton = document.getElementById("submit");
    var starting = document.getElementById("starting");
    var token = document.body.dataset.token || "";
    var busy = false;

    function showError(message) {
      errorBox.textContent = message;
      errorBox.hidden = !message;
    }

    function setBusy(value) {
      busy = value;
      submitButton.disabled = value;
      keyInput.readOnly = value;
    }

    // 与 Go 侧 newAccessKey 一致：32 字节随机数的十六进制（64 个字符）。
    function freshKey() {
      var bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      var out = "";
      for (var i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0");
      }
      return out;
    }

    document.getElementById("regenerate").addEventListener("click", function () {
      if (busy) return;
      keyInput.value = freshKey();
      showError("");
      keyInput.focus();
      keyInput.select();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy) return;

      var key = keyInput.value.trim();
      if (!key) {
        showError("访问密钥不能为空。");
        keyInput.focus();
        return;
      }

      var mode = form.querySelector("input[name=mode]:checked").value;
      setBusy(true);
      showError("");

      fetch("/__submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Kanso-Setup": token },
        body: JSON.stringify({ mode: mode, key: key })
      })
        .then(function (response) {
          return response.json().then(function (body) { return { ok: response.ok, body: body }; });
        })
        .then(function (result) {
          if (!result.ok || !result.body.ok) {
            throw new Error(result.body.error || "保存失败，请重试。");
          }
          // 服务端已落盘：主窗口随后接管，向导窗口会自动关闭。
          document.getElementById("setup-form").hidden = true;
          starting.hidden = false;
        })
        .catch(function (err) {
          setBusy(false);
          showError(err && err.message ? err.message : "保存失败，请重试。");
        });
    });

    keyInput.focus();
    keyInput.select();
  })();
</script>
</body>
</html>
`
