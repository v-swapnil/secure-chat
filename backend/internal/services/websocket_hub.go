package services

import (
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/gofrs/uuid"
)

type Connection struct {
	UserID   uuid.UUID
	DeviceID string
	Conn     *websocket.Conn
	Send     chan []byte
	LastSeen time.Time
}

type Hub struct {
	mu          sync.RWMutex
	connections map[uuid.UUID]*Connection
}

func NewHub() *Hub {
	return &Hub{
		connections: make(map[uuid.UUID]*Connection),
	}
}

func (h *Hub) Register(c *Connection) {
	h.mu.Lock()
	h.connections[c.UserID] = c
	h.mu.Unlock()
}

func (h *Hub) Unregister(uid uuid.UUID) {
	h.mu.Lock()
	if c, ok := h.connections[uid]; ok {
		close(c.Send)
		delete(h.connections, uid)
	}
	h.mu.Unlock()
}

func (h *Hub) SendTo(userID uuid.UUID, payload []byte) bool {
	h.mu.RLock()
	c, ok := h.connections[userID]
	h.mu.RUnlock()
	if !ok {
		return false
	}
	select {
	case c.Send <- payload:
		return true
	default:
		go h.Unregister(userID)
		return false
	}
}

// IsOnline checks if a user has an active WebSocket connection
func (h *Hub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.connections[userID]
	return ok
}
