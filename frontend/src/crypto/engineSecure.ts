import * as nacl from 'tweetnacl'
import { encodeBase64, decodeBase64 } from 'tweetnacl-util'
import { db } from '../services/db'
import {
  SessionState,
  createSessionState,
  dhRatchetSend,
  getNextSendMessageKey,
  getNextReceiveMessageKey,
  deriveMessageKeys,
  serializeSession,
  deserializeSession,
  dh,
  ratchetRootKey,
} from './session'

/**
 * Enhanced E2EE implementation with Double Ratchet-like protocol
 * Provides forward secrecy and post-compromise security
 */

export interface KeyPair {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

export interface EncryptedMessage {
  ciphertext: string
  ratchetPublicKey: string
  messageIndex: number
  previousChainLength: number
}

export class SecureCryptoEngine {
  private identityKeyPair: KeyPair | null = null
  private signingKeyPair: nacl.SignKeyPair | null = null
  private deviceId: string
  private sessions: Map<string, SessionState> = new Map()

  constructor(deviceId: string) {
    this.deviceId = deviceId
  }

  /**
   * Initialize or load identity key pair
   */
  async init(): Promise<void> {
    const keyId = `identity_${this.deviceId}`
    const stored = await db.identityKeys.get(keyId)
    if (stored) {
      this.identityKeyPair = {
        publicKey: stored.publicKey,
        secretKey: stored.privateKey,
      }
    } else {
      this.identityKeyPair = nacl.box.keyPair()
      await db.identityKeys.put({
        id: keyId,
        publicKey: this.identityKeyPair.publicKey,
        privateKey: this.identityKeyPair.secretKey,
      })
    }
    
    // Initialize signing key
    const signingKeyId = `signing_${this.deviceId}`
    const storedSigning = await db.identityKeys.get(signingKeyId)
    if (storedSigning) {
      this.signingKeyPair = {
        publicKey: storedSigning.publicKey,
        secretKey: storedSigning.privateKey,
      }
    } else {
      this.signingKeyPair = nacl.sign.keyPair()
      await db.identityKeys.put({
        id: signingKeyId,
        publicKey: this.signingKeyPair.publicKey,
        privateKey: this.signingKeyPair.secretKey,
      })
    }

    // Load existing sessions from database
    await this.loadSessions()
  }

  /**
   * Load all sessions from database
   */
  private async loadSessions(): Promise<void> {
    const storedSessions = await db.sessions.toArray()
    for (const stored of storedSessions) {
      try {
        const session = deserializeSession(stored.sessionState)
        this.sessions.set(session.sessionId, session)
      } catch (error) {
        console.error(`Failed to load session ${stored.id}:`, error)
      }
    }
  }

  /**
   * Initialize a new session with a partner
   */
  async initializeSession(partnerId: string, partnerPublicKey: string): Promise<void> {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')

    const partnerKey = decodeBase64(partnerPublicKey)
    
    // Check if session already exists
    if (this.sessions.has(partnerId)) {
      console.log(`Session with ${partnerId} already exists, reusing`)
      return
    }

    // Perform initial DH to create shared secret
    const sharedSecret = dh(this.identityKeyPair.secretKey, partnerKey)
    
    // Create new ephemeral ratchet key pair
    const ratchetKeyPair = nacl.box.keyPair()
    
    // Create session state
    const session = createSessionState(
      partnerId,
      sharedSecret,
      ratchetKeyPair,
      partnerKey // Use partner's identity key as initial ratchet key
    )
    
    this.sessions.set(partnerId, session)
    
    // Persist to database
    await this.saveSession(session)
    
    console.log(`Initialized new session with ${partnerId}`)
  }

  /**
   * Save session to database
   */
  private async saveSession(session: SessionState): Promise<void> {
    await db.sessions.put({
      id: session.sessionId,
      partnerId: session.sessionId,
      sessionState: serializeSession(session),
      createdAt: session.createdAt,
      lastUsed: session.lastUsed,
    })
  }

  /**
   * Get session for partner
   */
  private getSession(partnerId: string): SessionState {
    const session = this.sessions.get(partnerId)
    if (!session) {
      throw new Error(`No session found for partner: ${partnerId}`)
    }
    return session
  }

  /**
   * Encrypt a message using Double Ratchet
   */
  async encryptMessage(message: string, partnerId: string): Promise<string> {
    let session = this.getSession(partnerId)
    
    // Perform DH ratchet step (generates new ephemeral key)
    session = dhRatchetSend(session)
    
    // Get next message key from sending chain
    const { messageKey, newSession } = getNextSendMessageKey(session)
    session = newSession
    
    // Derive encryption keys from message key
    const { encryptKey, iv } = deriveMessageKeys(messageKey)
    
    // Encrypt message using NaCl secretbox
    const messageBytes = new TextEncoder().encode(message)
    const encrypted = nacl.secretbox(messageBytes, iv, encryptKey)
    
    if (!encrypted) throw new Error('Encryption failed')
    
    // Create message envelope with ratchet information
    const envelope: EncryptedMessage = {
      ciphertext: encodeBase64(encrypted),
      ratchetPublicKey: encodeBase64(session.sendingRatchetKey.publicKey),
      messageIndex: session.sendingChainKey.index - 1,
      previousChainLength: session.previousSendingChainLength,
    }
    
    // Update session
    this.sessions.set(partnerId, session)
    await this.saveSession(session)
    
    return JSON.stringify(envelope)
  }

  /**
   * Decrypt a message using Double Ratchet
   */
  async decryptMessage(encryptedEnvelope: string, partnerId: string): Promise<string> {
    const envelope: EncryptedMessage = JSON.parse(encryptedEnvelope)
    let session = this.getSession(partnerId)
    
    const receivedRatchetKey = decodeBase64(envelope.ratchetPublicKey)
    
    // Check if we need to perform DH ratchet (partner sent new ratchet key)
    if (
      !session.receivingRatchetPublicKey ||
      !arrayEquals(receivedRatchetKey, session.receivingRatchetPublicKey)
    ) {
      // Partner has ratcheted, update our session
      const dhOutput = dh(session.sendingRatchetKey.secretKey, receivedRatchetKey)
      const { newRootKey, newChainKey } = ratchetRootKey(
        session.rootKey,
        dhOutput
      )
      
      session = {
        ...session,
        rootKey: newRootKey,
        receivingChainKey: { key: newChainKey, index: 0 },
        receivingRatchetPublicKey: receivedRatchetKey,
      }
    }
    
    // Get message key from receiving chain
    const { messageKey, newSession } = getNextReceiveMessageKey(session)
    session = newSession
    
    // Derive encryption keys
    const { encryptKey, iv } = deriveMessageKeys(messageKey)
    
    // Decrypt message
    const ciphertext = decodeBase64(envelope.ciphertext)
    const decrypted = nacl.secretbox.open(ciphertext, iv, encryptKey)
    
    if (!decrypted) throw new Error('Decryption failed')
    
    // Update session
    this.sessions.set(partnerId, session)
    await this.saveSession(session)
    
    return new TextDecoder().decode(decrypted)
  }

  /**
   * Get public identity key as base64
   */
  getPublicIdentityKey(): string {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')
    return encodeBase64(this.identityKeyPair.publicKey)
  }

  /**
   * Get public signing key as base64
   */
  getPublicSigningKey(): string {
    if (!this.signingKeyPair) throw new Error('Signing key not initialized')
    return encodeBase64(this.signingKeyPair.publicKey)
  }

  /**
   * Generate pre-keys for initial key exchange
   */
  async generatePreKeys(count: number = 100): Promise<any[]> {
    const startId = `${this.deviceId}_0`
    const endId = `${this.deviceId}_${count - 1}`
    await db.preKeys.where('id').between(startId, endId, true, true).delete()
    
    const preKeys = []
    for (let i = 0; i < count; i++) {
      const keyPair = nacl.box.keyPair()
      const keyId = `${this.deviceId}_${i}`
      await db.preKeys.put({
        id: keyId,
        keyPair: {
          pubKey: keyPair.publicKey,
          privKey: keyPair.secretKey,
        },
      })
      preKeys.push({
        keyId: i,
        publicKey: encodeBase64(keyPair.publicKey),
      })
    }
    return preKeys
  }

  /**
   * Generate signed pre-key
   */
  async generateSignedPreKey(): Promise<any> {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')
    if (!this.signingKeyPair) throw new Error('Signing key not initialized')
    
    const keyPair = nacl.box.keyPair()
    const keyId = `${this.deviceId}_signed`
    
    const signature = nacl.sign.detached(
      keyPair.publicKey,
      this.signingKeyPair.secretKey
    )
    
    await db.preKeys.put({
      id: keyId,
      keyPair: {
        pubKey: keyPair.publicKey,
        privKey: keyPair.secretKey,
      },
    })

    return {
      keyId: -1,
      publicKey: encodeBase64(keyPair.publicKey),
      signature: encodeBase64(signature),
      isSigned: true,
    }
  }

  /**
   * Generate safety number for verification
   */
  generateSafetyNumber(theirPublicKey: string): string {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')

    const ourKey = this.identityKeyPair.publicKey
    const theirKey = decodeBase64(theirPublicKey)

    const combined = new Uint8Array(ourKey.length + theirKey.length)
    combined.set(ourKey)
    combined.set(theirKey, ourKey.length)

    const hash = nacl.hash(combined)
    
    const numbers: string[] = []
    for (let i = 0; i < 60; i += 5) {
      const chunk = hash.slice(i, i + 5)
      const num = chunk.reduce((acc: number, byte: number) => acc * 256 + byte, 0)
      numbers.push((num % 100000).toString().padStart(5, '0'))
    }

    return numbers.join(' ')
  }

  /**
   * Clear all stored keys and sessions
   */
  async clearKeys(): Promise<void> {
    await db.identityKeys.clear()
    await db.preKeys.clear()
    await db.sessions.clear()
    this.identityKeyPair = null
    this.sessions.clear()
  }

  /**
   * Get session info for debugging
   */
  getSessionInfo(partnerId: string): any {
    const session = this.sessions.get(partnerId)
    if (!session) return null
    
    return {
      sessionId: session.sessionId,
      sendingChainIndex: session.sendingChainKey.index,
      receivingChainIndex: session.receivingChainKey.index,
      createdAt: new Date(session.createdAt).toISOString(),
      lastUsed: new Date(session.lastUsed).toISOString(),
    }
  }
}

/**
 * Helper function to compare Uint8Arrays
 */
function arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Hash questionnaire answers into category tags
 */
export function hashQuestionnaireAnswers(answers: Record<string, string>): string[] {
  const tags: string[] = []
  
  for (const [question, answer] of Object.entries(answers)) {
    const combined = `${question}:${answer.toLowerCase()}`
    const hash = nacl.hash(new TextEncoder().encode(combined))
    const tag = encodeBase64(hash.slice(0, 16))
    tags.push(tag)
  }

  return tags
}
