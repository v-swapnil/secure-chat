package models

import (
	"time"

	"github.com/gofrs/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey"`
	Identifier     string    `gorm:"index;unique;not null"`
	IdentityPubKey []byte    `gorm:"type:bytea;not null"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Devices        []Device
}

type Device struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID       uuid.UUID `gorm:"type:uuid;index"`
	DeviceID     string    `gorm:"index;not null"`
	DevicePubKey []byte    `gorm:"type:bytea;not null"`
	CreatedAt    time.Time
}

type PreKey struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;index"`
	KeyID     string    `gorm:"index;not null"`
	PreKey    []byte    `gorm:"type:bytea;not null"`
	Signature []byte    `gorm:"type:bytea;not null"`
	ExpiresAt time.Time
	CreatedAt time.Time
}

type OneTimePreKey struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;index:idx_user_used"`
	PreKey    []byte    `gorm:"type:bytea;not null"`
	Used      bool      `gorm:"default:false;index:idx_user_used"`
	CreatedAt time.Time
}

type RegistrationSession struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey"`
	Identifier string    `gorm:"index"`
	OTPHash    []byte    `gorm:"type:bytea"`
	ExpiresAt  time.Time `gorm:"index"`
	CreatedAt  time.Time
}

type MatchProfile struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    uuid.UUID `gorm:"type:uuid;index"`
	TagHash   string    `gorm:"index"`
	CreatedAt time.Time
}

func (m *MatchProfile) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		id, err := uuid.NewV4()
		if err != nil {
			return err
		}
		m.ID = id
	}
	return nil
}
