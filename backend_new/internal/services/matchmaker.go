package services

import (
    "context"
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
}

func NewMatchmaker(db *gorm.DB) *Matchmaker {
    return &Matchmaker{
        DB:      db,
        queue:   make(chan uuid.UUID, 1000),
        pairing: make(map[uuid.UUID]uuid.UUID),
    }
}

func (m *Matchmaker) Enqueue(userID uuid.UUID) error {
    select {
    case m.queue <- userID:
        return nil
    default:
        return context.DeadlineExceeded
    }
}

func (m *Matchmaker) Run(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        case uid := <-m.queue:
            select {
            case uid2 := <-m.queue:
                m.mu.Lock()
                m.pairing[uid] = uid2
                m.pairing[uid2] = uid
                m.mu.Unlock()
            case <-time.After(5 * time.Second):
                // timeout - requeue or notify
            }
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
    }
}
