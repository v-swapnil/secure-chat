import Dexie, { Table } from 'dexie'

export interface StoredIdentityKey {
  id: string
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export interface StoredPreKey {
  id: string // Changed from number to string to support device-specific IDs
  keyPair: {
    pubKey: Uint8Array
    privKey: Uint8Array
  }
}

export interface StoredSession {
  id: string // sessionId
  partnerId: string
  sessionState: string // Serialized SessionState
  createdAt: number
  lastUsed: number
}

export interface StoredMessage {
  id: string
  sessionId: string
  from: string
  to: string
  content: string
  timestamp: number
  type: 'text' | 'system'
}

class CryptoDatabase extends Dexie {
  identityKeys!: Table<StoredIdentityKey>
  preKeys!: Table<StoredPreKey>
  sessions!: Table<StoredSession>
  messages!: Table<StoredMessage>

  constructor() {
    super('SecureChatDB')
    this.version(2).stores({
      identityKeys: 'id',
      preKeys: 'id',
      sessions: 'id, partnerId, lastUsed',
      messages: 'id, sessionId, timestamp',
    })
  }
}

export const db = new CryptoDatabase()
