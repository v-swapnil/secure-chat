package api

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofrs/uuid"
	"gorm.io/gorm"

	"github.com/securechat/backend/internal/config"
	"github.com/securechat/backend/internal/models"
	"github.com/securechat/backend/internal/services"
	"github.com/securechat/backend/internal/utils"
)

type App struct {
	DB         *gorm.DB
	OTPService *services.OTPService
	PreKeySvc  *services.PreKeyService
	Matchmaker *services.Matchmaker
	Hub        *services.Hub
	ServerPriv *rsa.PrivateKey
	Cfg        *config.Config
}

// POST /auth/register
func (a *App) RegisterHandler(c *fiber.Ctx) error {
	var req struct {
		Identifier string `json:"identifier"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	if req.Identifier == "" || len(req.Identifier) < 3 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "identifier must be at least 3 characters"})
	}
	otp, err := a.OTPService.CreateRegistrationSession(req.Identifier)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create session"})
	}
	// In dev return OTP; in prod send via SMS/email
	return c.JSON(fiber.Map{"status": "ok", "otp": otp})
}

// POST /auth/verify-2fa
func (a *App) Verify2FAHandler(c *fiber.Ctx) error {
	var req struct {
		Identifier     string `json:"identifier"`
		OTP            string `json:"otp"`
		IdentityPubKey string `json:"identity_pubkey"` // Required for new users
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	ok, err := a.OTPService.VerifyRegistrationSession(req.Identifier, req.OTP)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "verification failed"})
	}
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid otp"})
	}

	var user models.User
	if err := a.DB.Where("identifier = ?", req.Identifier).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// New user - require identity public key
			if req.IdentityPubKey == "" {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "identity_pubkey required for new users"})
			}
			identityPub, err := base64.StdEncoding.DecodeString(req.IdentityPubKey)
			if err != nil || len(identityPub) != 32 {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid identity_pubkey format"})
			}

			id, err := uuid.NewV4()
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate user id"})
			}
			user = models.User{
				ID:             id,
				Identifier:     req.Identifier,
				IdentityPubKey: identityPub,
			}
			if err := a.DB.Create(&user).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create user"})
			}
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
		}
	}

	// Generate JWT token
	token, err := generateJWT(user.ID, a.Cfg.JWTSigningKey)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"status":  "ok",
		"user_id": user.ID.String(),
		"token":   token,
	})
}

// POST /api/keys/prekeys/upload
func (a *App) PreKeysUploadHandler(c *fiber.Ctx) error {
	userID, err := GetUserID(c)
	if err != nil {
		return err
	}

	var req struct {
		EncryptedB64 string `json:"encrypted_blob"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	data, err := base64.StdEncoding.DecodeString(req.EncryptedB64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid base64"})
	}

	plaintext, err := utils.RSADecrypt(a.ServerPriv, data)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "decryption failed"})
	}

	var payload struct {
		IdentityPub     string   `json:"identity_pub"`
		SignedPreKey    string   `json:"signed_prekey"`
		SignedPreKeySig string   `json:"signed_prekey_signature"`
		OneTimePreKeys  []string `json:"one_time_prekeys"`
		DeviceID        string   `json:"device_id"`
		DevicePubKey    string   `json:"device_pubkey"`
	}
	if err := json.Unmarshal(plaintext, &payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	identityPub, err := base64.StdEncoding.DecodeString(payload.IdentityPub)
	if err != nil || len(identityPub) != 32 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid identity_pub"})
	}

	a.DB.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{"identity_pub_key": identityPub})

	sigBytes, err := base64.StdEncoding.DecodeString(payload.SignedPreKeySig)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid signature"})
	}

	spkBytes, err := base64.StdEncoding.DecodeString(payload.SignedPreKey)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid signed_prekey"})
	}

	if !utils.VerifyEd25519(identityPub, spkBytes, sigBytes) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "signature verification failed"})
	}

	if err := a.PreKeySvc.StoreSignedPreKey(userID, "signed-prekey-v1", spkBytes, sigBytes, time.Now().Add(30*24*time.Hour)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to store signed prekey"})
	}

	var otps [][]byte
	for _, s := range payload.OneTimePreKeys {
		b, err := base64.StdEncoding.DecodeString(s)
		if err != nil {
			continue
		}
		otps = append(otps, b)
	}
	if err := a.PreKeySvc.AddOneTimePreKeys(userID, otps); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to store one-time prekeys"})
	}

	devPub, err := base64.StdEncoding.DecodeString(payload.DevicePubKey)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid device_pubkey"})
	}

	did, err := uuid.NewV4()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate device id"})
	}

	device := models.Device{
		ID:           did,
		UserID:       userID,
		DeviceID:     payload.DeviceID,
		DevicePubKey: devPub,
	}
	if err := a.DB.Create(&device).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create device"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}
