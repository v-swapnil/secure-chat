package api

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/gofrs/uuid"

	"github.com/securechat/backend/internal/services"
)

// WebSocketHandler upgrades HTTP connection to WebSocket
func (a *App) WebSocketHandler(c *fiber.Ctx) error {
	// Check if websocket upgrade
	if !websocket.IsWebSocketUpgrade(c) {
		return c.Status(fiber.StatusUpgradeRequired).JSON(fiber.Map{"error": "websocket upgrade required"})
	}

	// Get user_id from context (set by auth middleware)
	userID, err := GetUserID(c)
	if err != nil {
		return err
	}

	return websocket.New(func(ws *websocket.Conn) {
		defer func() {
			a.Hub.Unregister(userID)
			ws.Close()
		}()

		// Create connection
		conn := &services.Connection{
			UserID:   userID,
			DeviceID: c.Query("device_id", "default"),
			Conn:     ws,
			Send:     make(chan []byte, 256),
			LastSeen: time.Now(),
		}

		// Register connection
		a.Hub.Register(conn)

		// Start write pump (send messages from channel to websocket)
		go func() {
			for {
				select {
				case message, ok := <-conn.Send:
					if !ok {
						ws.WriteMessage(websocket.CloseMessage, []byte{})
						return
					}
					if err := ws.WriteMessage(websocket.TextMessage, message); err != nil {
						log.Printf("write error: %v", err)
						return
					}
				}
			}
		}()

		// Read messages from client
		for {
			messageType, message, err := ws.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("websocket error: %v", err)
				}
				break
			}

			conn.LastSeen = time.Now()

			if messageType == websocket.TextMessage {
				// Parse message
				var msg struct {
					Type    string `json:"type"`
					To      string `json:"to"`
					Payload string `json:"payload"`
				}

				if err := json.Unmarshal(message, &msg); err != nil {
					log.Printf("invalid message format: %v", err)
					continue
				}

				// Handle different message types
				switch msg.Type {
				case "message":
					// Forward message to recipient
					if msg.To != "" {
						toUserID, err := uuid.FromString(msg.To)
						if err == nil {
							forward := map[string]interface{}{
								"type":      "message",
								"from":      userID.String(),
								"payload":   msg.Payload,
								"timestamp": time.Now().Unix(),
							}
							forwardBytes, _ := json.Marshal(forward)
							a.Hub.SendTo(toUserID, forwardBytes)
						}
					}
				case "ping":
					// Respond with pong
					pong := map[string]string{"type": "pong"}
					pongBytes, _ := json.Marshal(pong)
					conn.Send <- pongBytes
				default:
					log.Printf("unknown message type: %s", msg.Type)
				}
			}
		}
	})(c)
}

// Helper function to parse UUID
func parseUUID(s string) (uuid.UUID, error) {
	return uuid.FromString(s)
}
