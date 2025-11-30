package services

import (
    "crypto/rand"
    "encoding/base32"
    "time"

    "golang.org/x/crypto/bcrypt"
    "github.com/gofrs/uuid"
    "gorm.io/gorm"

    "github.com/securechat/backend/internal/models"
    "github.com/securechat/backend/internal/config"
)

func generateOTP(n int) (string, error) {
    b := make([]byte, n)
    if _, err := rand.Read(b); err != nil { return "", err }
    return base32.StdEncoding.EncodeToString(b)[:n], nil
}

type OTPService struct {
    DB  *gorm.DB
    Cfg *config.Config
}

func NewOTPService(db *gorm.DB, cfg *config.Config) *OTPService {
    return &OTPService{DB: db, Cfg: cfg}
}

func (s *OTPService) CreateRegistrationSession(identifier string) (string, error) {
    otp, err := generateOTP(6)
    if err != nil { return "", err }
    hashed, err := bcrypt.GenerateFromPassword([]byte(otp), bcrypt.DefaultCost)
    if err != nil { return "", err }
    id, _ := uuid.NewV4()
    sess := &models.RegistrationSession{
        ID:         id,
        Identifier: identifier,
        OTPHash:    hashed,
        ExpiresAt:  time.Now().Add(time.Duration(s.Cfg.OTPExpiryMinutes) * time.Minute),
    }
    if err := s.DB.Create(sess).Error; err != nil { return "", err }
    // TODO: send OTP via SMS/Email provider in production
    return otp, nil
}

func (s *OTPService) VerifyRegistrationSession(identifier, otp string) (bool, error) {
    var sess models.RegistrationSession
    if err := s.DB.Where("identifier = ? AND expires_at > ?", identifier, time.Now()).Order("created_at desc").First(&sess).Error; err != nil {
        return false, err
    }
    if err := bcrypt.CompareHashAndPassword(sess.OTPHash, []byte(otp)); err != nil { return false, nil }
    s.DB.Delete(&sess)
    return true, nil
}
