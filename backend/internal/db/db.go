package db

import (
"database/sql"
"fmt"
"os"

_ "github.com/lib/pq"
)

type DB struct {
conn *sql.DB
}

func NewDB() (*DB, error) {
dbURL := os.Getenv("DATABASE_URL")
if dbURL == "" {
return nil, fmt.Errorf("DATABASE_URL environment variable is not set")
}

conn, err := sql.Open("postgres", dbURL)
if err != nil {
return nil, fmt.Errorf("failed to open database: %w", err)
}

if err := conn.Ping(); err != nil {
return nil, fmt.Errorf("failed to ping database: %w", err)
}

return &DB{conn: conn}, nil
}

func (db *DB) Close() error {
return db.conn.Close()
}

func (db *DB) Conn() *sql.DB {
return db.conn
}

func (db *DB) Migrate() error {
schema := `
CREATE TABLE IF NOT EXISTS users (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
email VARCHAR(255) UNIQUE,
phone VARCHAR(20) UNIQUE,
password_hash TEXT NOT NULL,
identity_key TEXT NOT NULL,
two_fa_enabled BOOLEAN DEFAULT TRUE,
two_fa_secret TEXT,
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW(),
CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS devices (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
device_id VARCHAR(255) NOT NULL,
registration_id INTEGER NOT NULL,
created_at TIMESTAMP DEFAULT NOW(),
last_seen TIMESTAMP DEFAULT NOW(),
UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS prekeys (
id SERIAL PRIMARY KEY,
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
device_id VARCHAR(255) NOT NULL,
key_id INTEGER NOT NULL,
public_key TEXT NOT NULL,
signature TEXT,
is_signed BOOLEAN DEFAULT FALSE,
is_used BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP DEFAULT NOW(),
UNIQUE(user_id, device_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_prekeys_user_device ON prekeys(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_prekeys_unused ON prekeys(user_id, device_id, is_used) WHERE is_used = FALSE;

CREATE TABLE IF NOT EXISTS sessions (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
session_token TEXT NOT NULL UNIQUE,
expires_at TIMESTAMP NOT NULL,
created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);

CREATE TABLE IF NOT EXISTS match_queue (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
anonymous_id UUID NOT NULL,
category_tags TEXT[] NOT NULL,
ephemeral_identity_key TEXT NOT NULL,
ephemeral_signed_prekey TEXT NOT NULL,
joined_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_queue_tags ON match_queue USING GIN(category_tags);

CREATE TABLE IF NOT EXISTS active_matches (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user1_id UUID,
user2_id UUID,
anonymous1_id UUID NOT NULL,
anonymous2_id UUID NOT NULL,
matched_at TIMESTAMP DEFAULT NOW(),
ended_at TIMESTAMP
);
`

_, err := db.conn.Exec(schema)
return err
}
