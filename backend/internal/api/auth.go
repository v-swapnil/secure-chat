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
	if req.Password == "" {
		respondWithError(w, http.StatusBadRequest, "Password required")
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

	// Insert user WITHOUT identity key (added later after verification)
	var userID uuid.UUID
	query := `
		INSERT INTO users (email, phone, password_hash, two_fa_enabled, two_fa_secret)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`
	err = h.db.Conn().QueryRow(query, req.Email, req.Phone, string(hashedPassword), true, twoFASecret).Scan(&userID)
	if err != nil {
		// Log the actual error for debugging
		fmt.Printf("Registration error: %v\n", err)
		respondWithError(w, http.StatusConflict, "User already exists or registration failed")
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
	// Store code with user_id for temp token generation
	h.twoFACodes[identifier] = code
	h.twoFACodes[identifier+"_user_id"] = userID.String()

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

	// Get user_id stored during registration
	userIDStr, exists := h.twoFACodes[identifier+"_user_id"]
	if !exists {
		respondWithError(w, http.StatusInternalServerError, "User session expired")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Invalid user ID")
		return
	}

	// Generate temp token (10 minutes validity) for key upload
	tempToken, expiresAt, err := generateTempToken(userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to generate temp token")
		return
	}

	// Store temp token
	h.twoFACodes[tempToken] = userIDStr

	// Remove used code but keep user_id for a bit
	delete(h.twoFACodes, identifier)

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"message":    "Verification successful",
		"temp_token": tempToken,
		"user_id":    userID,
		"expires_at": expiresAt,
	})
}

func (h *AuthHandler) CompleteRegistration(w http.ResponseWriter, r *http.Request) {
	var req models.CompleteRegistrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate temp token
	userIDStr, exists := h.twoFACodes[req.TempToken]
	if !exists {
		respondWithError(w, http.StatusUnauthorized, "Invalid or expired temp token")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Invalid user ID")
		return
	}

	// Validate identity key format
	if err := validateIdentityKey(req.IdentityKey); err != nil {
		respondWithError(w, http.StatusBadRequest, fmt.Sprintf("Invalid identity key: %v", err))
		return
	}

	// Update user with identity key
	query := `UPDATE users SET identity_key = $1 WHERE id = $2`
	_, err = h.db.Conn().Exec(query, req.IdentityKey, userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update identity key")
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

	// Generate full JWT token
	token, expiresAt, err := generateJWT(userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	// Store session
	sessionQuery := `INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)`
	_, err = h.db.Conn().Exec(sessionQuery, userID, token, expiresAt)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	// Clean up temp token
	delete(h.twoFACodes, req.TempToken)
	delete(h.twoFACodes, userIDStr+"_user_id")

	respondWithJSON(w, http.StatusOK, models.LoginResponse{
		Token:     token,
		UserID:    userID,
		ExpiresAt: expiresAt,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.InitiateLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate input
	if req.Email == nil && req.Phone == nil {
		respondWithError(w, http.StatusBadRequest, "Email or phone required")
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

	// Generate and send 2FA code for login
	code := generateTwoFACode()
	identifier := ""
	if req.Email != nil {
		identifier = *req.Email
	} else if req.Phone != nil {
		identifier = *req.Phone
	}

	// Store code with user_id for verification
	h.twoFACodes[identifier+"_login"] = code
	h.twoFACodes[identifier+"_login_user_id"] = user.ID.String()

	// Send code
	if req.Email != nil {
		sendEmail(*req.Email, "Login verification code", fmt.Sprintf("Your code is: %s", code))
	} else if req.Phone != nil {
		sendSMS(*req.Phone, fmt.Sprintf("Your login code is: %s", code))
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Verification code sent. Please verify to continue.",
		"user_id": user.ID,
	})
}

func (h *AuthHandler) VerifyLogin(w http.ResponseWriter, r *http.Request) {
	var req models.VerifyLoginRequest
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
	storedCode, exists := h.twoFACodes[identifier+"_login"]
	if !exists || storedCode != req.Code {
		respondWithError(w, http.StatusUnauthorized, "Invalid verification code")
		return
	}

	// Get user_id
	userIDStr, exists := h.twoFACodes[identifier+"_login_user_id"]
	if !exists {
		respondWithError(w, http.StatusInternalServerError, "Login session expired")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Invalid user ID")
		return
	}

	// Check if device exists
	var existingDeviceID string
	deviceQuery := `SELECT device_id FROM devices WHERE user_id = $1 AND device_id = $2`
	err = h.db.Conn().QueryRow(deviceQuery, userID, req.DeviceID).Scan(&existingDeviceID)
	deviceExists := err == nil

	// Get all registered devices for this user
	var registeredDevices []string
	devicesQuery := `SELECT device_id FROM devices WHERE user_id = $1`
	rows, err := h.db.Conn().Query(devicesQuery, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var deviceID string
			if err := rows.Scan(&deviceID); err == nil {
				registeredDevices = append(registeredDevices, deviceID)
			}
		}
	}

	isNewDevice := !deviceExists

	// If device exists, update last_seen
	if deviceExists {
		updateQuery := `UPDATE devices SET last_seen = NOW() WHERE user_id = $1 AND device_id = $2`
		h.db.Conn().Exec(updateQuery, userID, req.DeviceID)
	}

	// Generate JWT token
	token, expiresAt, err := generateJWT(userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	// Store session
	sessionQuery := `INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)`
	_, err = h.db.Conn().Exec(sessionQuery, userID, token, expiresAt)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	// Clean up 2FA codes
	delete(h.twoFACodes, identifier+"_login")
	delete(h.twoFACodes, identifier+"_login_user_id")

	respondWithJSON(w, http.StatusOK, models.VerifyLoginResponse{
		Token:             token,
		UserID:            userID,
		ExpiresAt:         expiresAt,
		DeviceExists:      deviceExists,
		IsNewDevice:       isNewDevice,
		RegisteredDevices: registeredDevices,
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

func generateTempToken(userID uuid.UUID) (string, time.Time, error) {
	expiresAt := time.Now().Add(10 * time.Minute) // Short-lived for key upload
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"type":    "temp",
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

// validateIdentityKey validates that a base64-encoded identity key is valid
func validateIdentityKey(keyB64 string) error {
	// Decode base64
	keyBytes, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		return fmt.Errorf("invalid base64 encoding: %w", err)
	}

	// NaCl identity keys (Ed25519 public keys) should be 32 bytes
	if len(keyBytes) != 32 {
		return fmt.Errorf("invalid key length: expected 32 bytes, got %d", len(keyBytes))
	}

	return nil
}
