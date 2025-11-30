package services

import (
    "time"

    "github.com/gofrs/uuid"
    "gorm.io/gorm"

    "github.com/securechat/backend/internal/models"
)

type PreKeyService struct {
    DB *gorm.DB
}

func NewPreKeyService(db *gorm.DB) *PreKeyService {
    return &PreKeyService{DB: db}
}

func (s *PreKeyService) StoreSignedPreKey(userID uuid.UUID, keyID string, prekey []byte, signature []byte, expires time.Time) error {
    pk := &models.PreKey{
        ID:        uuid.Must(uuid.NewV4()),
        UserID:    userID,
        KeyID:     keyID,
        PreKey:    prekey,
        Signature: signature,
        ExpiresAt: expires,
    }
    return s.DB.Create(pk).Error
}

func (s *PreKeyService) AddOneTimePreKeys(userID uuid.UUID, keys [][]byte) error {
    for _, k := range keys {
        otp := &models.OneTimePreKey{
            ID:     uuid.Must(uuid.NewV4()),
            UserID: userID,
            PreKey: k,
            Used:   false,
        }
        if err := s.DB.Create(otp).Error; err != nil { return err }
    }
    return nil
}

func (s *PreKeyService) ConsumeOneTimePreKey(userID uuid.UUID) (*models.OneTimePreKey, error) {
    var p models.OneTimePreKey
    tx := s.DB.Begin()
    if err := tx.Clauses(gorm.Locking{Strength: "UPDATE"}).Where("user_id = ? AND used = false", userID).Order("created_at asc").First(&p).Error; err != nil {
        tx.Rollback()
        return nil, err
    }
    p.Used = true
    if err := tx.Save(&p).Error; err != nil {
        tx.Rollback()
        return nil, err
    }
    tx.Commit()
    return &p, nil
}
