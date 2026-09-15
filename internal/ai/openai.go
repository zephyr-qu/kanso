// Package ai 提供 OpenAI 兼容 Chat Completions 客户端（AI 捕获）。
package ai

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

// ChatClient 调用 OpenAI 兼容的 /chat/completions。
type ChatClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	HTTPClient *http.Client
}

// ChatMessage 是对话消息。
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string               `json:"model"`
	Messages       []ChatMessage        `json:"messages"`
	ResponseFormat *chatResponseFormat  `json:"response_format,omitempty"`
	Temperature    float64              `json:"temperature"`
}

type chatResponseFormat struct {
	Type string `json:"type"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// CompleteJSON 请求 JSON 对象响应，返回助手 content 原文。
func (c *ChatClient) CompleteJSON(ctx context.Context, system, user string) (string, error) {
	if strings.TrimSpace(c.APIKey) == "" {
		return "", fmt.Errorf("未配置 AI API Key")
	}
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		return "", fmt.Errorf("未配置 AI Base URL")
	}
	model := c.Model
	if model == "" {
		return "", fmt.Errorf("未配置 AI 模型")
	}
	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	payload, err := json.Marshal(chatRequest{
		Model: model,
		Messages: []ChatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		ResponseFormat: &chatResponseFormat{Type: "json_object"},
		Temperature:    0.2,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	res, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("调用 AI 失败: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", fmt.Errorf("读取 AI 响应失败: %w", err)
	}
	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("解析 AI 响应失败: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return "", fmt.Errorf("AI 错误: %s", parsed.Error.Message)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("AI HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	if len(parsed.Choices) == 0 || parsed.Choices[0].Message.Content == "" {
		return "", fmt.Errorf("AI 未返回内容")
	}
	return parsed.Choices[0].Message.Content, nil
}
