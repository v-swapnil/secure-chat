package api

import (
    "crypto/rsa"
    "encoding/base64"
    "encoding/json"
    "net/http"
    "time"

    "github.com/gofrs/uuid"
    "github.com/gofiber/fiber/v2"
    "gorm.io/gorm"

    "github.com/securechat/backend/internal/services"
    "github.com/securechat/backend/internal/utils"
    "github.com/securechat/backend/internal/models"
)

type App struct {
    DB           *gorm.DB
    OTPService   *services.OTPService
    PreKeySvc    *services.PreKeyService
    Matchmaker   *services.Matchmaker
    Hub          *services.Hub
    ServerPriv   *rsa.PrivateKey
}

// POST /auth/register
func (a *App) RegisterHandler(c *fiber.Ctx) error {
    var req struct{ Identifier string `json:"identifier"` }
    if err := c.BodyParser(&req); err != nil { return fiber.ErrBadRequest }
    otp, err := a.OTPService.CreateRegistrationSession(req.Identifier)
    if err != nil { return fiber.ErrInternalServerError }
    // In dev return OTP; in prod send via SMS/email
    return c.JSON(fiber.Map{"status":"ok","otp":otp})
}

// POST /auth/verify-2fa
func (a *App) Verify2FAHandler(c *fiber.Ctx) error {
    var req struct {
        Identifier string `json:"identifier"`
        OTP string `json:"otp"`
    }
    if err := c.BodyParser(&req); err != nil { return fiber.ErrBadRequest }
    ok, err := a.OTPService.VerifyRegistrationSession(req.Identifier, req.OTP)
    if err != nil { return fiber.ErrInternalServerError }
    if !ok { return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error":"invalid otp"}) }
    var user models.User
    if err := a.DB.Where("identifier = ?", req.Identifier).First(&user).Error; err != nil {
        if err == gorm.ErrRecordNotFound {
            id, _ := uuid.NewV4()
            user = models.User{ID: id, Identifier: req.Identifier}
            if err := a.DB.Create(&user).Error; err != nil { return fiber.ErrInternalServerError }
        } else {
            return fiber.ErrInternalServerError
        }
    }
    // return temp token (in prod sign JWT)
    return c.JSON(fiber.Map{"status":"ok","user_id":user.ID.String(),"temp_token":"TODO"})
}

// POST /keys/prekeys/upload
func (a *App) PreKeysUploadHandler(c *fiber.Ctx) error {
    var req struct {
        UserID string `json:"user_id"`
        EncryptedB64 string `json:"encrypted_blob"`
    }
    if err := c.BodyParser(&req); err != nil { return fiber.ErrBadRequest }
    data, err := base64.StdEncoding.DecodeString(req.EncryptedB64)
    if err != nil { return fiber.ErrBadRequest }
    plaintext, err := utils.RSADecrypt(a.ServerPriv, data)
    if err != nil { return fiber.ErrBadRequest }
    var payload struct {
        IdentityPub      string   `json:"identity_pub"`
        SignedPreKey     string   `json:"signed_prekey"`
        SignedPreKeySig  string   `json:"signed_prekey_signature"`
        OneTimePreKeys   []string `json:"one_time_prekeys"`
        DeviceID         string   `json:"device_id"`
        DevicePubKey     string   `json:"device_pubkey"`
    }
    if err := json.Unmarshal(plaintext, &payload); err != nil { return fiber.ErrBadRequest }
    uid, err := uuid.FromString(req.UserID)
    if err != nil { return fiber.ErrBadRequest }
    identityPub, _ := base64.StdEncoding.DecodeString(payload.IdentityPub)
    a.DB.Model(&models.User{}).Where("id = ?", uid).Updates(map[string]interface{}{"identity_pub_key": identityPub})
    sigBytes, _ := base64.StdEncoding.DecodeString(payload.SignedPreKeySig)
    spkBytes, _ := base64.StdEncoding.DecodeString(payload.SignedPreKey)
    if !utils.VerifyEd25519(identityPub, spkBytes, sigBytes) {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error":"signature verification failed"})
    }
    a.PreKeySvc.StoreSignedPreKey(uid, "signed-prekey-v1", spkBytes, sigBytes, time.Now().Add(30*24*time.Hour))
    var otps [][]byte
    for _, s := range payload.OneTimePreKeys {
        b, _ := base64.StdEncoding.DecodeString(s)
        otps = append(otps, b)
    }
    a.PreKeySvc.AddOneTimePreKeys(uid, otps)
    devPub, _ := base64.StdEncoding.DecodeString(payload.DevicePubKey)
    did := uuid.Must(uuid.NewV4())
    device := models.Device{
        ID: did,
        UserID: uid,
        DeviceID: payload.DeviceID,
        DevicePubKey: devPub,
    }
    a.DB.Create(&device)
    return c.JSON(fiber.Map{"status":"ok"})
}
