// Package realtime 测试：hub 的慢消费者丢弃路径（广播永不阻塞）。
package realtime

import (
	"encoding/json"
	"testing"
)

// TestSlowConsumerDrops 校验发送缓冲满时广播丢弃而非阻塞：
// 订阅者不读取时，连续广播超过缓冲容量（32）后仍可返回，且不 panic。
func TestSlowConsumerDrops(t *testing.T) {
	hub := NewHub()
	send := hub.Subscribe("p1")

	for i := 0; i < 100; i++ {
		hub.Broadcast("p1", Event{Type: "task.created", ProjectID: "p1", EntityID: "t"})
	}

	// 缓冲满后的事件被丢弃：读取容量内的数据后，不应再有可读事件。
	// 缓冲容量为 32，前 32 条应完整收到，后续全部被丢弃。
	for i := 0; i < 32; i++ {
		select {
		case msg := <-send:
			var ev Event
			if err := json.Unmarshal(msg, &ev); err != nil {
				t.Fatalf("解析事件失败: %v", err)
			}
			if ev.Type != "task.created" {
				t.Fatalf("事件类型错误: %+v", ev)
			}
		default:
			t.Fatalf("第 %d 条事件应仍在缓冲中", i)
		}
	}
	select {
	case msg := <-send:
		t.Fatalf("缓冲满后事件应被丢弃，实际仍收到 %s", msg)
	default:
	}
}

// TestUnsubscribeStopsDelivery 校验注销后不再收到广播（断开清理路径）。
func TestUnsubscribeStopsDelivery(t *testing.T) {
	hub := NewHub()
	send := hub.Subscribe("p1")
	hub.Unsubscribe("p1", send)

	hub.Broadcast("p1", Event{Type: "task.created", ProjectID: "p1"})
	select {
	case msg := <-send:
		t.Fatalf("注销后不应再收到事件，实际 %s", msg)
	default:
	}
}

// TestBroadcastProjectIsolation 校验项目级广播只投递给订阅该项目者（hub 层面）。
func TestBroadcastProjectIsolation(t *testing.T) {
	hub := NewHub()
	subA := hub.Subscribe("p1")
	subB := hub.Subscribe("p2")

	hub.Broadcast("p1", Event{Type: "task.created", ProjectID: "p1"})

	select {
	case msg := <-subA:
		var ev Event
		if err := json.Unmarshal(msg, &ev); err != nil {
			t.Fatalf("解析事件失败: %v", err)
		}
		if ev.ProjectID != "p1" {
			t.Fatalf("订阅者 A 应收到 p1 事件，实际 %+v", ev)
		}
	default:
		t.Fatal("订阅者 A 应收到事件")
	}
	select {
	case msg := <-subB:
		t.Fatalf("订阅者 B 不应收到 p1 事件，实际 %s", msg)
	default:
	}
}

// TestBroadcastAllReachesEverySubscriber 校验工作区级广播（BroadcastAll）覆盖全部连接，无论订阅项目。
func TestBroadcastAllReachesEverySubscriber(t *testing.T) {
	hub := NewHub()
	subA := hub.Subscribe("p1")
	subB := hub.Subscribe("p2")

	hub.BroadcastAll(Event{Type: "label.created", WorkspaceID: "w1", EntityID: "l1"})

	for name, ch := range map[string]chan []byte{"A": subA, "B": subB} {
		select {
		case msg := <-ch:
			var ev Event
			if err := json.Unmarshal(msg, &ev); err != nil {
				t.Fatalf("订阅者 %s 解析事件失败: %v", name, err)
			}
			if ev.Type != "label.created" || ev.WorkspaceID != "w1" {
				t.Fatalf("订阅者 %s 收到事件不符: %+v", name, ev)
			}
		default:
			t.Fatalf("订阅者 %s 应收到全广播事件", name)
		}
	}
}

// TestBroadcastNoSubscribersNoPanic 校验无订阅者时广播不 panic（空目标路径）。
func TestBroadcastNoSubscribersNoPanic(t *testing.T) {
	hub := NewHub()
	hub.Broadcast("nobody", Event{Type: "task.created", ProjectID: "nobody"})
	hub.BroadcastAll(Event{Type: "label.created", WorkspaceID: "w1"})
}

// TestSubscribeExistingProjectReuses 校验同一项目多个订阅者各自独立通道。
func TestSubscribeExistingProjectReuses(t *testing.T) {
	hub := NewHub()
	c1 := hub.Subscribe("p1")
	c2 := hub.Subscribe("p1")
	if c1 == c2 {
		t.Fatal("同一项目的两个订阅者应返回不同通道")
	}
	hub.Broadcast("p1", Event{Type: "task.created", ProjectID: "p1"})
	for name, ch := range map[string]chan []byte{"1": c1, "2": c2} {
		select {
		case <-ch:
		default:
			t.Fatalf("订阅者 %s 应收到事件", name)
		}
	}
}
