# 不该随页面上线的说明

`index.html` 与 `style.css` 是原样发布的，里面的每条注释都公开可读（view-source 就能看到）。
读起来像内部推理、而不是给下一个编辑者的指令的内容写在这里。本文件列在 `.assetsignore` 里，
不会部署到任何地方。

## 部署

Cloudflare Workers 静态资源，与 wisp 落地页同一形态（`zephyr_english/designs/wisp-landing`）：

- `wrangler.toml`：Worker `kanso`，路由 `www.zephyrqu.top/kanso`（裸路径）与 `/kanso/*`，
  `assets.directory = "./"`；没有 Worker 脚本，部署的全是文件。
- `_redirects`：把 `/kanso` 前缀代理掉，页面里的路径才能保持相对，同一份文件双击本地打开也成立。
- `_headers`：只给 `media/*`（重跑抓图流水线才会变）抬高缓存；字体与 favicon 保持回源校验，
  它们的文件名不带内容哈希，重新生成会重写同名文件。
- `.assetsignore`：`embed.go`（Go 的 embed 声明）、wrangler 自己的文件、本文件都不上传。
- 部署：在本目录执行 `wrangler deploy`。**不要用 `wrangler dev`**：配置与目录同级时，wrangler
  写进 `.wrangler/tmp` 的产物落在被监听的目录里，会无限触发重建（wisp 那边实测 15 秒 36 次）。

## 三处要一起动的东西

- **插图**：`pnpm --dir web build` → 起后端 → `pnpm --dir web exec node tools/capture-landing-shots.mjs`
  与 `build-og-card.mjs`，产物落在 `media/`。`media/*` 有 7 天缓存，重新部署后旧图可能仍在边缘缓存里，
  必要时 purge。
- **品牌字「簡」**：`python web/tools/build-brand-mark.py`（`--check` 只校验不写入）。它同时写
  `favicon.svg`、`index.html` 的 `<symbol>`，并往应用字体子集里合并字形。
- **分享卡地址**：`og:image` 与 `twitter:image` 用**绝对地址**
  `https://www.zephyrqu.top/kanso/media/og-card.png`——爬虫不解析相对地址。同一份 `index.html`
  也被 Go 二进制在自托管实例的 `/` 上提供，那里会沿用这些绝对地址：对外分享的正式地址就是这个
  Cloudflare 页面。

## 页面本身没有的路径

页面里唯一的对外链接是 GitHub 仓库；没有应用入口（`/login`）、没有下载按钮。所以 `_redirects`
里不需要 wisp 那样的 `/download` 中转。页面挂在与应用不同的地址上，任何指向应用的绝对路径在这里
都会 404——这也是当初去掉「进入工作区」的原因。
