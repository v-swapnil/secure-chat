package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/secret-project/backend/internal/db"
	"github.com/secret-project/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db         *db.DB
	twoFACodes map[string]string // In production, use Redis
}

func NewAuthHandler(database *db.DB) *AuthHandler {
	return &AuthHandler{
		db:         database,
		twoFACodes: make(map[string]string),
	}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate input
	if req.Email == nil && req.Phone == nil {
		respondWithError(w, http.StatusBadRequest, "Email or phone required")
		return
	}
	if req.Password == "" || req.IdentityKey == "" || req.DeviceID == "" {
		respondWithError(w, http.StatusBadRequest, "Missing required fields")
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	// Generate 2FA secret
	twoFASecret := generateSecret()

	// Insert user
	var userID uuid.UUID
	query := `
		INSERT INTO users (email, phone, password_hash, identity_key, two_fa_enabled, two_fa_secret)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	err = h.db.Conn().QueryRow(query, req.Email, req.Phone, string(hashedPassword), req.IdentityKey, true, twoFASecret).Scan(&userID)
	if err != nil {
		respondWithError(w, http.StatusConflict, "User already exists")
		return
	}

	// Insert device
	deviceQuery := `
		INSERT INTO devices (user_id, device_id, registration_id)
		VALUES ($1, $2, $3)
	`
	_, err = h.db.Conn().Exec(deviceQuery, userID, req.DeviceID, req.RegistrationID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to register device")
		return
	}

	// Generate and send 2FA code
	code := generateTwoFACode()
	identifier := ""
	if req.Email != nil {
		identifier = *req.Email
	} else if req.Phone != nil {
		identifier = *req.Phone
	}
	h.twoFACodes[identifier] = code

	// Send code (mock implementation)
	if req.Email != nil {
		sendEmail(*req.Email, "Your verification code", fmt.Sprintf("Your code is: %s", code))
	} else if req.Phone != nil {
		sendSMS(*req.Phone, fmt.Sprintf("Your verification code is: %s", code))
	}

	respondWithJSON(w, http.StatusCreated, map[string]interface{}{
		"user_id": userID,
		"message": "Registration successful. Please verify with 2FA code.",
	})
}

func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req models.VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	identifier := ""
	if req.Email != nil {
		identifier = *req.Email
	} else if req.Phone != nil {
		identifier = *req.Phone
	} else {
		respondWithError(w, http.StatusBadRequest, "Email or phone required")
		return
	}

	// Verify code
	storedCode, exists := h.twoFACodes[identifier]
	if !exists || storedCode != req.Code {
		respondWithError(w, http.StatusUnauthorized, "Invalid verification code")
		return
	}

	// Remove used code
	delete(h.twoFACodes, identifier)

	respondWithJSON(w, http.StatusOK, map[string]string{
		"message": "Verification successful",
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Get user
	var user models.User
	query := `SELECT id, email, phone, password_hash, identity_key FROM users WHERE email = $1 OR phone = $2`
	err := h.db.Conn().QueryRow(query, req.Email, req.Phone).Scan(
		&user.ID, &user.Email, &user.Phone, &user.PasswordHash, &user.IdentityKey,
	)
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		respondWithError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Update device last_seen
	updateDeviceQuery := `
		INSERT INTO devices (user_id, device_id, registration_id, last_seen)
		VALUES ($1, $2, 0, NOW())
		ON CONFLICT (user_id, device_id) 
		DO UPDATE SET last_seen = NOW()
	`
	_, err = h.db.Conn().Exec(updateDeviceQuery, user.ID, req.DeviceID)
	if err != nil {
		// Log error but don't fail login
	}

	// Generate JWT
	token, expiresAt, err := generateJWT(user.ID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	// Store session
	sessionQuery := `INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)`
	_, err = h.db.Conn().Exec(sessionQuery, user.ID, token, expiresAt)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	respondWithJSON(w, http.StatusOK, models.LoginResponse{
		Token:     token,
		UserID:    user.ID,
		ExpiresAt: expiresAt,
	})
}

// Helper functions

func generateSecret() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return base64.StdEncoding.EncodeToString(bytes)
}

func generateTwoFACode() string {
	// Generate 6-digit code
	bytes := make([]byte, 3)
	rand.Read(bytes)
	code := int(bytes[0])<<16 | int(bytes[1])<<8 | int(bytes[2])
	return fmt.Sprintf("%06d", code%1000000)
}

func generateJWT(userID uuid.UUID) (string, time.Time, error) {
	expiresAt := time.Now().Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"exp":     expiresAt.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default-secret-change-in-production"
	}

	signedToken, err := token.SignedString([]byte(secret))
	return signedToken, expiresAt, err
}

func sendEmail(to, subject, body string) {
	// Mock implementation - integrate with SMTP server
	fmt.Printf("Sending email to %s: %s\n", to, body)
}

func sendSMS(to, body string) {
	// Mock implementation - integrate with Twilio
	fmt.Printf("Sending SMS to %s: %s\n", to, body)
}

func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, map[string]string{"error": message})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}
