package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var fixed = time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)

func newHub() *Hub { return NewHub(func() time.Time { return fixed }) }

func TestPublishDeliversOnlyToTopic(t *testing.T) {
	h := newHub()
	seller := h.Register(TopicSeller)
	order := h.Register(TopicOrder("1"))
	h.Publish(TopicSeller, TypeOrderCreated, map[string]string{"id": "1"})

	select {
	case b := <-seller.send:
		var m Message
		require.NoError(t, json.Unmarshal(b, &m))
		assert.Equal(t, TypeOrderCreated, m.Type)
		assert.Equal(t, fixed, m.ServerTime)
	default:
		t.Fatal("seller không nhận được message")
	}
	assert.Empty(t, order.send)
}

func TestSlowConsumerIsKickedWithoutBlockingPublisher(t *testing.T) {
	h := newHub()
	slow := h.Register(TopicSeller)
	fast := h.Register(TopicSeller)

	done := make(chan struct{})
	go func() {
		for range sendBuffer + 10 {
			h.Publish(TopicSeller, TypeOrderUpdated, nil)
			<-fast.send
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("publisher bị chặn bởi kết nối chậm")
	}
	select {
	case <-slow.done:
	default:
		t.Fatal("kết nối chậm phải bị kick")
	}
	select {
	case <-fast.done:
		t.Fatal("kết nối nhanh không được bị kick")
	default:
	}
}

func TestUnregisterRemovesEmptyTopics(t *testing.T) {
	h := newHub()
	c := h.Register(TopicMenu("A"), TopicOrder("1"))
	assert.ElementsMatch(t, []string{"menu:A"}, h.Topics(MenuTopicPrefix))
	h.Unregister(c)
	assert.Empty(t, h.Topics(""))
	h.Unregister(c) // gọi hai lần không panic
}

type stubAuth struct{ topics []string }

func (s stubAuth) CustomerTopics(context.Context, string, string, string) ([]string, error) {
	if s.topics == nil {
		return nil, errors.New("forbidden")
	}
	return s.topics, nil
}

func wsURL(srv *httptest.Server, path string) string {
	return "ws" + strings.TrimPrefix(srv.URL, "http") + path
}

func readMessage(t *testing.T, ctx context.Context, c *websocket.Conn) Message {
	t.Helper()
	_, b, err := c.Read(ctx)
	require.NoError(t, err)
	var m Message
	require.NoError(t, json.Unmarshal(b, &m))
	return m
}

func TestHandlersEndToEnd(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newHub()
	r := gin.New()
	r.GET("/ws/seller", SellerHandler(h, nil))
	r.GET("/ws/customer", CustomerHandler(h, stubAuth{topics: []string{TopicOrder("1")}}, nil))
	r.GET("/ws/denied", CustomerHandler(h, stubAuth{}, nil))
	srv := httptest.NewServer(r)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	seller, _, err := websocket.Dial(ctx, wsURL(srv, "/ws/seller"), nil)
	require.NoError(t, err)
	defer func() { _ = seller.CloseNow() }()
	customer, _, err := websocket.Dial(ctx, wsURL(srv, "/ws/customer?order=1"), nil)
	require.NoError(t, err)
	defer func() { _ = customer.CloseNow() }()

	require.Eventually(t, func() bool { return h.Count(TopicSeller) == 1 && h.Count(TopicOrder("1")) == 1 }, time.Second, 10*time.Millisecond)

	h.Publish(TopicSeller, TypeSettingsUpdated, map[string]bool{"accepting_orders": false})
	h.Publish(TopicOrder("1"), TypeOrderUpdated, map[string]string{"status": "accepted"})
	assert.Equal(t, TypeSettingsUpdated, readMessage(t, ctx, seller).Type)
	assert.Equal(t, TypeOrderUpdated, readMessage(t, ctx, customer).Type)

	denied, _, err := websocket.Dial(ctx, wsURL(srv, "/ws/denied"), nil)
	require.NoError(t, err)
	_, _, err = denied.Read(ctx)
	assert.Equal(t, CloseForbidden, websocket.CloseStatus(err))

	h.CloseAll()
	_, _, err = seller.Read(ctx)
	assert.Equal(t, websocket.StatusGoingAway, websocket.CloseStatus(err))
}

func TestCrossOriginUpgradeRejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newHub()
	r := gin.New()
	r.GET("/ws/seller", SellerHandler(h, []string{"sidecup.example"}))
	srv := httptest.NewServer(r)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, wsURL(srv, "/ws/seller"), &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}},
	})
	require.Error(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)

	ok, _, err := websocket.Dial(
		ctx, wsURL(srv, "/ws/seller"), &websocket.DialOptions{
			HTTPHeader: http.Header{"Origin": []string{"https://sidecup.example"}},
		})
	require.NoError(t, err)
	_ = ok.CloseNow()
}
