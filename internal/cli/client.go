package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client 是面向 Kanso HTTP API 的薄封装。
type Client struct {
	base   string
	key    string
	client *http.Client
}

// NewClient 创建客户端；key 可为空（仅无鉴权接口）。
func NewClient(base, key string) *Client {
	return &Client{
		base: strings.TrimRight(base, "/"),
		key:  key,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// APIError 表示非 2xx 响应中的错误体。
type APIError struct {
	Status  int
	Message string
	Body    []byte
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("HTTP %d: %s", e.Status, e.Message)
	}
	return fmt.Sprintf("HTTP %d", e.Status)
}

// DoJSON 发起 JSON 请求并把成功响应解码到 out（可为 nil）。
func (c *Client) DoJSON(ctx context.Context, method, path string, in, out any) error {
	_, err := c.DoRaw(ctx, method, path, in, out)
	return err
}

// DoRaw 返回原始响应体；成功时若 out 非 nil 则同时解码。
func (c *Client) DoRaw(ctx context.Context, method, path string, in, out any) ([]byte, error) {
	var body io.Reader
	if in != nil {
		payload, err := json.Marshal(in)
		if err != nil {
			return nil, fmt.Errorf("编码请求体失败: %w", err)
		}
		body = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, body)
	if err != nil {
		return nil, fmt.Errorf("构造请求失败: %w", err)
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.key != "" {
		req.Header.Set("Authorization", "Bearer "+c.key)
	}
	res, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		msg := ""
		var errBody struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(raw, &errBody) == nil {
			msg = errBody.Error
		}
		return raw, &APIError{Status: res.StatusCode, Message: msg, Body: raw}
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return raw, fmt.Errorf("解析响应失败: %w", err)
		}
	}
	return raw, nil
}
