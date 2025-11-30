package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/secret-project/backend/internal/db"
	"github.com/secret-project/backend/internal/models"
)

type KeyHandler struct {
	db *db.DB
}

func NewKeyHandler(database *db.DB) *KeyHandler {
	return &KeyHandler{db: database}
}

func (h *KeyHandler) GetIdentityKey(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	userIDStr := vars["userId"]

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var identityKey string
	query := `SELECT identity_key FROM users WHERE id = $1`
	err = h.db.Conn().QueryRow(query, userID).Scan(&identityKey)
	if err != nil {
		respondWithError(w, http.StatusNotFound, "User not found")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"user_id":      userID,
		"identity_key": identityKey,
	})
}

func (h *KeyHandler) UploadPreKeys(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r)
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.UploadPreKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Insert signed pre-key
	signedQuery := `
		INSERT INTO prekeys (user_id, device_id, key_id, public_key, signature, is_signed)
		VALUES ($1, $2, $3, $4, $5, true)
		ON CONFLICT (user_id, device_id, key_id) 
		DO UPDATE SET public_key = $4, signature = $5
	`
	_, err := h.db.Conn().Exec(signedQuery, userID, req.DeviceID, req.SignedPreKey.KeyID,
		req.SignedPreKey.PublicKey, req.SignedPreKey.Signature)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to upload signed pre-key")
		return
	}

	// Insert one-time pre-keys
	for _, prekey := range req.OneTimePreKeys {
		onetimeQuery := `
			INSERT INTO prekeys (user_id, device_id, key_id, public_key, is_signed, is_used)
			VALUES ($1, $2, $3, $4, false, false)
			ON CONFLICT (user_id, device_id, key_id) DO NOTHING
		`
		_, err := h.db.Conn().Exec(onetimeQuery, userID, req.DeviceID, prekey.KeyID, prekey.PublicKey)
		if err != nil {
			// Log error but continue
		}
	}

	respondWithJSON(w, http.StatusOK, map[string]string{
		"message": "Pre-keys uploaded successfully",
	})
}

func (h *KeyHandler) GetPreKeyBundle(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	userIDStr := vars["userId"]

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	// Get identity key
	var identityKey string
	identityQuery := `SELECT identity_key FROM users WHERE id = $1`
	err = h.db.Conn().QueryRow(identityQuery, userID).Scan(&identityKey)
	if err != nil {
		respondWithError(w, http.StatusNotFound, "User not found")
		return
	}

	// Get device (latest)
	var deviceID string
	var registrationID int
	deviceQuery := `SELECT device_id, registration_id FROM devices WHERE user_id = $1 ORDER BY last_seen DESC LIMIT 1`
	err = h.db.Conn().QueryRow(deviceQuery, userID).Scan(&deviceID, &registrationID)
	if err != nil {
		respondWithError(w, http.StatusNotFound, "No device found")
		return
	}

	// Get signed pre-key
	var signedPreKey models.PreKey
	signedQuery := `SELECT key_id, public_key, signature FROM prekeys WHERE user_id = $1 AND device_id = $2 AND is_signed = true ORDER BY created_at DESC LIMIT 1`
	err = h.db.Conn().QueryRow(signedQuery, userID, deviceID).Scan(&signedPreKey.KeyID, &signedPreKey.PublicKey, &signedPreKey.Signature)
	if err != nil {
		respondWithError(w, http.StatusNotFound, "No signed pre-key found")
		return
	}
	signedPreKey.IsSigned = true

	// Get one-time pre-key
	var oneTimePreKey *models.PreKey
	onetimeQuery := `
		UPDATE prekeys 
		SET is_used = true 
		WHERE id = (
			SELECT id FROM prekeys 
			WHERE user_id = $1 AND device_id = $2 AND is_signed = false AND is_used = false 
			ORDER BY created_at 
			LIMIT 1
		)
		RETURNING key_id, public_key
	`
	var otp models.PreKey
	err = h.db.Conn().QueryRow(onetimeQuery, userID, deviceID).Scan(&otp.KeyID, &otp.PublicKey)
	if err == nil {
		otp.IsSigned = false
		oneTimePreKey = &otp
	} else if err != sql.ErrNoRows {
		// Log warning but continue without one-time pre-key
	}

	bundle := models.PreKeyBundle{
		UserID:         userID,
		DeviceID:       deviceID,
		IdentityKey:    identityKey,
		SignedPreKey:   signedPreKey,
		OneTimePreKey:  oneTimePreKey,
		RegistrationID: registrationID,
	}

	respondWithJSON(w, http.StatusOK, bundle)
}
