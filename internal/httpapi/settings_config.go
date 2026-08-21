// 设置页配置端点：读取/保存服务端运行配置（kanso-config.json）。
// addr/dataDir/wsOrigins 为启动参数，保存后重启生效；运行模式仅由 KANSO_MODE 环境变量在启动时决定（不可经设置页保存）。
package httpapi

import (
	"net/http"
	"strings"

	"kanso/internal/config"
)

type settingsConfigRequest struct {
	Addr    string `json:"addr"`
	DataDir string `json:"dataDir"`
	// WSOrigins 逗号分隔白名单（可空）。运行模式不在其中：仅由 KANSO_MODE 启动时决定。
	WSOrigins            string `json:"wsOrigins"`
	AutoArchiveAfterDays *int   `json:"autoArchiveAfterDays"`
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
		"addr":                 cfg.Addr,
		"dataDir":              cfg.DataDir,
		"mode":                 string(cfg.Mode),
		"wsOrigins":            strings.Join(cfg.WSOrigins, ","),
		"autoArchiveEnabled":   cfg.AutoArchiveEnabled,
		"autoArchiveAfterDays": config.NormalizeAutoArchiveAfterDays(cfg.AutoArchiveAfterDays),
		"configFile":           a.configFile,
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
	// 自动归档开关只允许通过配置文件控制；设置页只能调整保留时长。
	autoArchiveEnabled := a.cfg.AutoArchiveEnabled
	autoArchiveAfterDays := config.NormalizeAutoArchiveAfterDays(a.cfg.AutoArchiveAfterDays)
	if req.AutoArchiveAfterDays != nil {
		autoArchiveAfterDays = *req.AutoArchiveAfterDays
	}
	if !config.ValidAutoArchiveAfterDays(autoArchiveAfterDays) {
		writeError(w, http.StatusBadRequest, "自动归档时长无效，应为 1-3650 天")
		return
	}
	if err := config.SaveFile(a.configFile, config.FileConfig{
		Addr:                 req.Addr,
		DataDir:              req.DataDir,
		AccessKey:            a.cfg.AccessKey,
		WSOrigins:            req.WSOrigins,
		AutoArchiveEnabled:   &autoArchiveEnabled,
		AutoArchiveAfterDays: autoArchiveAfterDays,
	}); err != nil {
		writeServiceError(w, err, "写入配置文件失败")
		return
	}

	a.cfg.AutoArchiveEnabled = autoArchiveEnabled
	a.cfg.AutoArchiveAfterDays = autoArchiveAfterDays
	a.svc.SetAutoArchiveSettings(autoArchiveEnabled, autoArchiveAfterDays)

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"configFile": a.configFile,
	})
}
