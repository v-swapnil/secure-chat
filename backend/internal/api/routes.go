package api

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/secret-project/backend/internal/db"
	"github.com/secret-project/backend/internal/websocket"
)

func SetupRoutes(router *mux.Router, database *db.DB, hub *websocket.Hub) {
	// Health check
	router.HandleFunc("/health", HealthCheckHandler).Methods("GET")

	// API v1
	api := router.PathPrefix("/api/v1").Subrouter()

	// Auth routes
	authHandler := NewAuthHandler(database)
	api.HandleFunc("/auth/register", authHandler.Register).Methods("POST")
	api.HandleFunc("/auth/verify", authHandler.Verify).Methods("POST")
	api.HandleFunc("/auth/login", authHandler.Login).Methods("POST")

	// Key management routes (requires auth)
	keyHandler := NewKeyHandler(database)
	api.HandleFunc("/keys/identity/{userId}", keyHandler.GetIdentityKey).Methods("GET")
	api.HandleFunc("/keys/prekeys", AuthMiddleware(keyHandler.UploadPreKeys)).Methods("POST")
	api.HandleFunc("/keys/prekeys/{userId}", keyHandler.GetPreKeyBundle).Methods("GET")

	// Matching routes
	matchHandler := NewMatchHandler(database)
	api.HandleFunc("/match/queue", AuthMiddleware(matchHandler.JoinQueue)).Methods("POST")
	api.HandleFunc("/match/status", AuthMiddleware(matchHandler.GetStatus)).Methods("GET")
	api.HandleFunc("/match/queue", AuthMiddleware(matchHandler.LeaveQueue)).Methods("DELETE")

	// WebSocket route
	wsHandler := NewWebSocketHandler(hub, database)
	router.HandleFunc("/ws", wsHandler.HandleWebSocket)
}

func HealthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}
