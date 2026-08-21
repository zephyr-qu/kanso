// 设置页配置端点：读取/保存服务端运行配置（kanso-config.json）。
// addr/dataDir/wsOrigins 为启动参数，保存后重启生效；运行模式仅由 KANSO_MODE 环境变量在启动时决定（不可经设置页保存）；accessKey 保存时热同步成员表（立即生效，旧密钥失效）。
package httpapi

import (
	"net/http"
	"strings"

	"kanso/internal/config"
)

type settingsConfigRequest struct {
	Addr      string `json:"addr"`
	DataDir   string `json:"dataDir"`
	AccessKey string `json:"accessKey"`
	// WSOrigins 逗号分隔白名单（可空）。运行模式不在其中：仅由 KANSO_MODE 启动时决定。
	WSOrigins string `json:"wsOrigins"`
}

// getSettingsConfig 返回当前生效配置（GET /api/settings/config）。
func (a *API) getSettingsConfig(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwnerInTeam(w, r) {
		return
	}
	a.cfgMu.RLock()
	cfg := a.cfg
	a.cfgMu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"addr":       cfg.Addr,
		"dataDir":    cfg.DataDir,
		"accessKey":  cfg.AccessKey,
		"mode":       string(cfg.Mode),
		"wsOrigins":  strings.Join(cfg.WSOrigins, ","),
		"configFile": a.configFile,
	})
}

// updateSettingsConfig 保存配置到文件（PUT /api/settings/config）。
func (a *API) updateSettingsConfig(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwnerInTeam(w, r) {
		return
	}
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()

	var req settingsConfigRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if err := config.Validate(config.Config{
		Addr:    req.Addr,
		DataDir: req.DataDir,
		Mode:    a.cfg.Mode,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "运行配置无效: "+err.Error())
		return
	}
	// accessKey 可留空：表示未设置（下次启动随机生成，沿用既有行为）。

	if err := config.SaveFile(a.configFile, config.FileConfig{
		Addr:      req.Addr,
		DataDir:   req.DataDir,
		AccessKey: req.AccessKey,
		WSOrigins: req.WSOrigins,
	}); err != nil {
		writeServiceError(w, err, "写入配置文件失败")
		return
	}

	// accessKey 热生效：非空且与当前不同 → 同步成员表，旧密钥立即失效（前端需提示重新登录）。
	accessKeyApplied := false
	if req.AccessKey != "" && req.AccessKey != a.cfg.AccessKey {
		if err := a.svc.SeedOwnerMember(r.Context(), req.AccessKey); err != nil {
			writeServiceError(w, err, "密钥已写入文件但同步成员表失败")
			return
		}
		a.cfg.AccessKey = req.AccessKey
		accessKeyApplied = true
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":               true,
		"configFile":       a.configFile,
		"accessKeyApplied": accessKeyApplied,
	})
}
