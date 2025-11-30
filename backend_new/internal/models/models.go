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
    ID             uuid.UUID `gorm:"type:uuid;primaryKey"`
    UserID         uuid.UUID `gorm:"type:uuid;index"`
    KeyID          string    `gorm:"index;not null"`
    PreKey         []byte    `gorm:"type:bytea;not null"`
    Signature      []byte    `gorm:"type:bytea;not null"`
    ExpiresAt      time.Time
    CreatedAt      time.Time
}

type OneTimePreKey struct {
    ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
    UserID    uuid.UUID `gorm:"type:uuid;index"`
    PreKey    []byte    `gorm:"type:bytea;not null"`
    Used      bool      `gorm:"default:false;index"`
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
    ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
    UserID    uuid.UUID `gorm:"type:uuid;index"`
    TagHash   string    `gorm:"index"`
    CreatedAt time.Time
}
