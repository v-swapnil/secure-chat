package api

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
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

// GET /auth/check-username?username=xxx
func (a *App) CheckUsernameHandler(c *fiber.Ctx) error {
	username := c.Query("username")
	if username == "" || len(username) < 3 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "username must be at least 3 characters"})
	}

	var user models.User
	if err := a.DB.Where("identifier = ?", username).First(&user).Error; err == nil {
		return c.JSON(fiber.Map{"available": false, "message": "Username already taken"})
	} else if err != gorm.ErrRecordNotFound {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.JSON(fiber.Map{"available": true, "message": "Username is available"})
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

	// Check if user already exists
	var existingUser models.User
	if err := a.DB.Where("identifier = ?", req.Identifier).First(&existingUser).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "username already taken"})
	} else if err != gorm.ErrRecordNotFound {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
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

	var payload struct {
		IdentityPub     string   `json:"identity_pub"`
		SigningPub      string   `json:"signing_pub"`
		SignedPreKey    string   `json:"signed_prekey"`
		SignedPreKeySig string   `json:"signed_prekey_signature"`
		OneTimePreKeys  []string `json:"one_time_prekeys"`
		DeviceID        string   `json:"device_id"`
		DevicePubKey    string   `json:"device_pubkey"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	identityPub, err := base64.StdEncoding.DecodeString(payload.IdentityPub)
	if err != nil || len(identityPub) != 32 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid identity_pub"})
	}

	signingPub, err := base64.StdEncoding.DecodeString(payload.SigningPub)
	if err != nil || len(signingPub) != 32 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid signing_pub"})
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

	if !utils.VerifyEd25519(signingPub, spkBytes, sigBytes) {
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

// GET /auth/server-pubkey
func (a *App) ServerPublicKeyHandler(c *fiber.Ctx) error {
	// Export in PKIX/SPKI format for Web Crypto API
	pubBytes, err := x509.MarshalPKIXPublicKey(&a.ServerPriv.PublicKey)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to marshal public key"})
	}
	pubPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubBytes,
	})
	return c.JSON(fiber.Map{
		"public_key": string(pubPEM),
	})
}
