package api

import (
	"net/http"

	"github.com/secret-project/backend/internal/db"
	"github.com/secret-project/backend/internal/websocket"
)

type WebSocketHandler struct {
	hub *websocket.Hub
	db  *db.DB
}

func NewWebSocketHandler(hub *websocket.Hub, database *db.DB) *WebSocketHandler {
	return &WebSocketHandler{
		hub: hub,
		db:  database,
	}
}

func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Extract user ID from query params or auth token
	token := r.URL.Query().Get("token")
	if token == "" {
		respondWithError(w, http.StatusUnauthorized, "Missing token")
		return
	}

	// Validate token and get user ID (simplified)
	// In production, use proper JWT validation

	websocket.ServeWS(h.hub, w, r)
}
