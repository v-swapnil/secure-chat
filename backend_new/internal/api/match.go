package api

import (
	"encoding/base64"

	"github.com/gofiber/fiber/v2"
	"github.com/gofrs/uuid"
	"gorm.io/gorm"

	"github.com/securechat/backend/internal/models"
) // POST /api/match/enqueue
func (a *App) EnqueueMatchHandler(c *fiber.Ctx) error {
	userID, err := GetUserID(c)
	if err != nil {
		return err
	}

	var req struct {
		TagHash string `json:"tag_hash"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.TagHash == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tag_hash required"})
	}

	// Store match profile
	id, err := uuid.NewV4()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate id"})
	}
	profile := &models.MatchProfile{
		ID:      id,
		UserID:  userID,
		TagHash: req.TagHash,
	}
	if err := a.DB.FirstOrCreate(profile, "user_id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create profile"})
	} // Enqueue for matching
	if err := a.Matchmaker.Enqueue(userID); err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "queue full, try again"})
	}

	return c.JSON(fiber.Map{"status": "queued"})
}

// GET /api/match/status
func (a *App) MatchStatusHandler(c *fiber.Ctx) error {
	userID, err := GetUserID(c)
	if err != nil {
		return err
	}

	// Check if matched
	pairID, matched := a.Matchmaker.GetPair(userID)
	if !matched {
		return c.JSON(fiber.Map{"status": "waiting"})
	}

	return c.JSON(fiber.Map{
		"status":  "matched",
		"pair_id": pairID.String(),
	})
}

// GET /api/keys/bundle/:user_id
func (a *App) GetKeyBundleHandler(c *fiber.Ctx) error {
	_, err := GetUserID(c)
	if err != nil {
		return err
	}

	targetUserIDStr := c.Params("user_id")
	if targetUserIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id required"})
	}

	targetUserID, err := parseUUID(targetUserIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user_id"})
	}

	// Get user
	var user models.User
	if err := a.DB.Where("id = ?", targetUserID).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// Get signed prekey
	var prekey models.PreKey
	if err := a.DB.Where("user_id = ?", targetUserID).Order("created_at desc").First(&prekey).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no prekey found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// Get one-time prekey
	oneTimeKey, err := a.PreKeySvc.ConsumeOneTimePreKey(targetUserID)
	var oneTimeKeyB64 string
	if err == nil && oneTimeKey != nil {
		oneTimeKeyB64 = base64.StdEncoding.EncodeToString(oneTimeKey.PreKey)
	}

	// Get devices
	var devices []models.Device
	if err := a.DB.Where("user_id = ?", targetUserID).Find(&devices).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	devicesData := make([]map[string]string, len(devices))
	for i, d := range devices {
		devicesData[i] = map[string]string{
			"device_id":     d.DeviceID,
			"device_pubkey": base64.StdEncoding.EncodeToString(d.DevicePubKey),
		}
	}

	return c.JSON(fiber.Map{
		"user_id":                 user.ID.String(),
		"identity_pub":            base64.StdEncoding.EncodeToString(user.IdentityPubKey),
		"signed_prekey":           base64.StdEncoding.EncodeToString(prekey.PreKey),
		"signed_prekey_signature": base64.StdEncoding.EncodeToString(prekey.Signature),
		"one_time_prekey":         oneTimeKeyB64,
		"devices":                 devicesData,
	})
}
