package websocket
package websocket

import (
	"sync"

	"github.com/google/uuid"
)

type Hub struct {




































































}	return online	_, online := h.clients[userID]	defer h.mu.RUnlock()	h.mu.RLock()func (h *Hub) IsOnline(userID uuid.UUID) bool {}	h.broadcast <- msgfunc (h *Hub) SendMessage(msg *Message) {}	}		}			}				}					h.mu.Unlock()					delete(h.clients, client.UserID)					close(client.send)					h.mu.Lock()				default:				case client.send <- message:				select {			if ok {			h.mu.RUnlock()			client, ok := h.clients[message.To]			h.mu.RLock()		case message := <-h.broadcast:			h.mu.Unlock()			}				close(client.send)				delete(h.clients, client.UserID)			if _, ok := h.clients[client.UserID]; ok {			h.mu.Lock()		case client := <-h.unregister:			h.mu.Unlock()			h.clients[client.UserID] = client			h.mu.Lock()		case client := <-h.register:		select {	for {func (h *Hub) Run() {}	}		unregister: make(chan *Client),		register:   make(chan *Client),		broadcast:  make(chan *Message, 256),		clients:    make(map[uuid.UUID]*Client),	return &Hub{func NewHub() *Hub {}	Payload map[string]interface{} `json:"payload"`	Type    string                 `json:"type"`	To      uuid.UUID              `json:"to"`	From    uuid.UUID              `json:"from"`type Message struct {}	mu         sync.RWMutex	unregister chan *Client	register   chan *Client	broadcast  chan *Message	clients    map[uuid.UUID]*Client