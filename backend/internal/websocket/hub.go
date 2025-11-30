package websocket

import (
"sync"

"github.com/google/uuid"
)

type Hub struct {
clients    map[uuid.UUID]*Client
broadcast  chan *Message
register   chan *Client
unregister chan *Client
mu         sync.RWMutex
}

type Message struct {
From    uuid.UUID              `json:"from"`
To      uuid.UUID              `json:"to"`
Type    string                 `json:"type"`
Payload map[string]interface{} `json:"payload"`
}

func NewHub() *Hub {
return &Hub{
clients:    make(map[uuid.UUID]*Client),
broadcast:  make(chan *Message, 256),
register:   make(chan *Client),
unregister: make(chan *Client),
}
}

func (h *Hub) Run() {
for {
select {
case client := <-h.register:
h.mu.Lock()
h.clients[client.UserID] = client
h.mu.Unlock()

case client := <-h.unregister:
h.mu.Lock()
if _, ok := h.clients[client.UserID]; ok {
delete(h.clients, client.UserID)
close(client.send)
}
h.mu.Unlock()

case message := <-h.broadcast:
h.mu.RLock()
client, ok := h.clients[message.To]
h.mu.RUnlock()

if ok {
select {
case client.send <- message:
default:
h.mu.Lock()
close(client.send)
delete(h.clients, client.UserID)
h.mu.Unlock()
}
}
}
}
}

func (h *Hub) SendMessage(msg *Message) {
h.broadcast <- msg
}

func (h *Hub) IsOnline(userID uuid.UUID) bool {
h.mu.RLock()
defer h.mu.RUnlock()
_, online := h.clients[userID]
return online
}
