package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `json:"id"`
	Email        *string   `json:"email,omitempty"`
	Phone        *string   `json:"phone,omitempty"`
	PasswordHash string    `json:"-"`
	IdentityKey  string    `json:"identity_key"`
	TwoFAEnabled bool      `json:"two_fa_enabled"`
	TwoFASecret  string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Device struct {
	ID             uuid.UUID `json:"id"`
	UserID         uuid.UUID `json:"user_id"`
	DeviceID       string    `json:"device_id"`
	RegistrationID int       `json:"registration_id"`
	CreatedAt      time.Time `json:"created_at"`
	LastSeen       time.Time `json:"last_seen"`
}

type PreKey struct {
	ID        int       `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	DeviceID  string    `json:"device_id"`
	KeyID     int       `json:"key_id"`
	PublicKey string    `json:"public_key"`
	Signature *string   `json:"signature,omitempty"`
	IsSigned  bool      `json:"is_signed"`
	IsUsed    bool      `json:"is_used"`
	CreatedAt time.Time `json:"created_at"`
}

type Session struct {
	ID           uuid.UUID `json:"id"`
	UserID       uuid.UUID `json:"user_id"`
	SessionToken string    `json:"session_token"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}

type MatchQueueEntry struct {
	ID                    uuid.UUID  `json:"id"`
	UserID                *uuid.UUID `json:"user_id,omitempty"`
	AnonymousID           uuid.UUID  `json:"anonymous_id"`
	CategoryTags          []string   `json:"category_tags"`
	EphemeralIdentityKey  string     `json:"ephemeral_identity_key"`
	EphemeralSignedPreKey string     `json:"ephemeral_signed_prekey"`
	JoinedAt              time.Time  `json:"joined_at"`
}

type ActiveMatch struct {
	ID           uuid.UUID  `json:"id"`
	User1ID      *uuid.UUID `json:"user1_id,omitempty"`
	User2ID      *uuid.UUID `json:"user2_id,omitempty"`
	Anonymous1ID uuid.UUID  `json:"anonymous1_id"`
	Anonymous2ID uuid.UUID  `json:"anonymous2_id"`
	MatchedAt    time.Time  `json:"matched_at"`
	EndedAt      *time.Time `json:"ended_at,omitempty"`
}

type RegisterRequest struct {
	Email    *string `json:"email,omitempty"`
	Phone    *string `json:"phone,omitempty"`
	Password string  `json:"password"`
}

type CompleteRegistrationRequest struct {
	TempToken      string `json:"temp_token"`
	IdentityKey    string `json:"identity_key"`
	DeviceID       string `json:"device_id"`
	RegistrationID int    `json:"registration_id"`
}

type VerifyRequest struct {
	Email *string `json:"email,omitempty"`
	Phone *string `json:"phone,omitempty"`
	Code  string  `json:"code"`
}

type InitiateLoginRequest struct {
	Email    *string `json:"email,omitempty"`
	Phone    *string `json:"phone,omitempty"`
	Password string  `json:"password"`
}

type VerifyLoginRequest struct {
	Email    *string `json:"email,omitempty"`
	Phone    *string `json:"phone,omitempty"`
	Code     string  `json:"code"`
	DeviceID string  `json:"device_id"`
}

type LoginRequest struct {
	Email    *string `json:"email,omitempty"`
	Phone    *string `json:"phone,omitempty"`
	Password string  `json:"password"`
	DeviceID string  `json:"device_id"`
}

type LoginResponse struct {
	Token     string    `json:"token"`
	UserID    uuid.UUID `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
}

type VerifyLoginResponse struct {
	Token             string    `json:"token"`
	UserID            uuid.UUID `json:"user_id"`
	ExpiresAt         time.Time `json:"expires_at"`
	DeviceExists      bool      `json:"device_exists"`
	IsNewDevice       bool      `json:"is_new_device"`
	RegisteredDevices []string  `json:"registered_devices,omitempty"`
}

type PreKeyBundle struct {
	UserID         uuid.UUID `json:"user_id"`
	DeviceID       string    `json:"device_id"`
	IdentityKey    string    `json:"identity_key"`
	SignedPreKey   PreKey    `json:"signed_prekey"`
	OneTimePreKey  *PreKey   `json:"onetime_prekey,omitempty"`
	RegistrationID int       `json:"registration_id"`
}

type UploadPreKeysRequest struct {
	DeviceID       string   `json:"device_id"`
	SignedPreKey   PreKey   `json:"signed_prekey"`
	OneTimePreKeys []PreKey `json:"onetime_prekeys"`
}

type JoinMatchQueueRequest struct {
	CategoryTags          []string `json:"category_tags"`
	EphemeralIdentityKey  string   `json:"ephemeral_identity_key"`
	EphemeralSignedPreKey string   `json:"ephemeral_signed_prekey"`
}

type MatchStatusResponse struct {
	Matched             bool       `json:"matched"`
	MatchID             *uuid.UUID `json:"match_id,omitempty"`
	PartnerAnonymousID  *uuid.UUID `json:"partner_anonymous_id,omitempty"`
	PartnerEphemeralKey *string    `json:"partner_ephemeral_key,omitempty"`
	PartnerSignedPreKey *string    `json:"partner_signed_prekey,omitempty"`
}
