package api
package api

import (
	"github.com/gorilla/mux"
	"github.com/secret-project/backend/internal/db"
	"github.com/secret-project/backend/internal/websocket"
)




































}	w.Write([]byte(`{"status":"ok"}`))	w.WriteHeader(http.StatusOK)	w.Header().Set("Content-Type", "application/json")func HealthCheckHandler(w http.ResponseWriter, r *http.Request) {}	router.HandleFunc("/ws", wsHandler.HandleWebSocket)	wsHandler := NewWebSocketHandler(hub, database)	// WebSocket route	api.HandleFunc("/match/queue", AuthMiddleware(matchHandler.LeaveQueue)).Methods("DELETE")	api.HandleFunc("/match/status", AuthMiddleware(matchHandler.GetStatus)).Methods("GET")	api.HandleFunc("/match/queue", AuthMiddleware(matchHandler.JoinQueue)).Methods("POST")	matchHandler := NewMatchHandler(database)	// Matching routes	api.HandleFunc("/keys/prekeys/{userId}", keyHandler.GetPreKeyBundle).Methods("GET")	api.HandleFunc("/keys/prekeys", AuthMiddleware(keyHandler.UploadPreKeys)).Methods("POST")	api.HandleFunc("/keys/identity/{userId}", keyHandler.GetIdentityKey).Methods("GET")	keyHandler := NewKeyHandler(database)	// Key management routes (requires auth)	api.HandleFunc("/auth/login", authHandler.Login).Methods("POST")	api.HandleFunc("/auth/verify", authHandler.Verify).Methods("POST")	api.HandleFunc("/auth/register", authHandler.Register).Methods("POST")	authHandler := NewAuthHandler(database)	// Auth routes	api := router.PathPrefix("/api/v1").Subrouter()	// API v1	router.HandleFunc("/health", HealthCheckHandler).Methods("GET")	// Health checkfunc SetupRoutes(router *mux.Router, database *db.DB, hub *websocket.Hub) {