package services

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/gofrs/uuid"
	"gorm.io/gorm"
)

type Matchmaker struct {
	DB      *gorm.DB
	queue   chan uuid.UUID
	mu      sync.Mutex
	pairing map[uuid.UUID]uuid.UUID
	waiting map[uuid.UUID]time.Time
}

func NewMatchmaker(db *gorm.DB) *Matchmaker {
	return &Matchmaker{
		DB:      db,
		queue:   make(chan uuid.UUID, 1000),
		pairing: make(map[uuid.UUID]uuid.UUID),
		waiting: make(map[uuid.UUID]time.Time),
	}
}

func (m *Matchmaker) Enqueue(userID uuid.UUID) error {
	select {
	case m.queue <- userID:
		m.mu.Lock()
		m.waiting[userID] = time.Now()
		m.mu.Unlock()
		return nil
	default:
		return context.DeadlineExceeded
	}
}

func (m *Matchmaker) Run(ctx context.Context) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Try to match pairs from queue
			m.tryMatch()
			// Clean up expired waiting entries
			m.cleanupWaiting()
		}
	}
}

func (m *Matchmaker) tryMatch() {
	// Try to get two users from queue
	var uid1, uid2 uuid.UUID
	var hasFirst, hasSecond bool

	select {
	case uid1 = <-m.queue:
		hasFirst = true
	default:
		return
	}

	// Try to get second user with timeout
	select {
	case uid2 = <-m.queue:
		hasSecond = true
	case <-time.After(50 * time.Millisecond):
		// No second user available, requeue first user
		select {
		case m.queue <- uid1:
		default:
			log.Printf("failed to requeue user %s", uid1)
		}
		return
	}

	if hasFirst && hasSecond {
		m.mu.Lock()
		m.pairing[uid1] = uid2
		m.pairing[uid2] = uid1
		delete(m.waiting, uid1)
		delete(m.waiting, uid2)
		m.mu.Unlock()
		log.Printf("matched users: %s <-> %s", uid1, uid2)
	}
}

func (m *Matchmaker) cleanupWaiting() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for userID, t := range m.waiting {
		// Remove users waiting for more than 5 minutes
		if now.Sub(t) > 5*time.Minute {
			delete(m.waiting, userID)
			log.Printf("removed expired waiting user: %s", userID)
		}
	}
}

func (m *Matchmaker) GetPair(userID uuid.UUID) (uuid.UUID, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.pairing[userID]
	return p, ok
}

func (m *Matchmaker) RemovePair(userID uuid.UUID) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p, ok := m.pairing[userID]; ok {
		delete(m.pairing, p)
		delete(m.pairing, userID)
		log.Printf("removed pairing: %s <-> %s", userID, p)
	}
}
