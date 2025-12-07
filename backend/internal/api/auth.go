package api

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofrs/uuid"
	"github.com/golang-jwt/jwt/v5"
)

// generateJWT creates a JWT token for the user
func generateJWT(userID uuid.UUID, secret string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// AuthMiddleware validates JWT tokens
func (a *App) AuthMiddleware(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing authorization header"})
	}

	// Extract token from "Bearer <token>"
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid authorization format"})
	}

	tokenString := parts[1]

	// Parse and validate token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.ErrUnauthorized
		}
		return []byte(a.Cfg.JWTSigningKey), nil
	})

	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
	}

	// Extract claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token claims"})
	}

	// Extract user_id
	userIDStr, ok := claims["user_id"].(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user_id in token"})
	}

	userID, err := uuid.FromString(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user_id format"})
	}

	// Store user_id in context
	c.Locals("user_id", userID)

	return c.Next()
}

// GetUserID extracts user ID from context (set by AuthMiddleware)
func GetUserID(c *fiber.Ctx) (uuid.UUID, error) {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return uuid.Nil, fiber.NewError(fiber.StatusUnauthorized, "user not authenticated")
	}
	return userID, nil
}
