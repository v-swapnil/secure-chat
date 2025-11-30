import * as nacl from 'tweetnacl'
import { encodeBase64, decodeBase64 } from 'tweetnacl-util'
import { db } from '../services/db'

/**
 * Simplified E2EE implementation using NaCl
 * In production, use libsignal-protocol-js for proper X3DH + Double Ratchet
 */

export interface KeyPair {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

export class CryptoEngine {
  private identityKeyPair: KeyPair | null = null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private deviceId: string

  constructor(deviceId: string) {
    this.deviceId = deviceId
  }

  /**
   * Initialize or load identity key pair
   */
  async init(): Promise<void> {
    const stored = await db.identityKeys.get('identity')
    if (stored) {
      this.identityKeyPair = {
        publicKey: stored.publicKey,
        secretKey: stored.privateKey,
      }
    } else {
      this.identityKeyPair = nacl.box.keyPair()
      await db.identityKeys.add({
        id: 'identity',
        publicKey: this.identityKeyPair.publicKey,
        privateKey: this.identityKeyPair.secretKey,
      })
    }
  }

  /**
   * Get public identity key as base64
   */
  getPublicIdentityKey(): string {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')
    return encodeBase64(this.identityKeyPair.publicKey)
  }

  /**
   * Generate pre-keys
   */
  async generatePreKeys(count: number = 100): Promise<any[]> {
    const preKeys = []
    for (let i = 0; i < count; i++) {
      const keyPair = nacl.box.keyPair()
      await db.preKeys.add({
        id: i,
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
   * Generate signed pre-key (simplified - no actual signing in this demo)
   */
  async generateSignedPreKey(): Promise<any> {
    const keyPair = nacl.box.keyPair()
    const signature = 'mock-signature' // In production, sign with identity key
    
    await db.preKeys.add({
      id: -1, // Special ID for signed pre-key
      keyPair: {
        pubKey: keyPair.publicKey,
        privKey: keyPair.secretKey,
      },
    })

    return {
      keyId: -1,
      publicKey: encodeBase64(keyPair.publicKey),
      signature,
      isSigned: true,
    }
  }

  /**
   * Encrypt a message to recipient
   */
  async encryptMessage(message: string, recipientPublicKey: string): Promise<string> {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')

    const recipientKey = decodeBase64(recipientPublicKey)
    const messageBytes = new TextEncoder().encode(message)
    const nonce = nacl.randomBytes(24)

    const encrypted = nacl.box(
      messageBytes,
      nonce,
      recipientKey,
      this.identityKeyPair.secretKey
    )

    // Combine nonce and ciphertext
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return encodeBase64(combined)
  }

  /**
   * Decrypt a message from sender
   */
  async decryptMessage(encryptedMessage: string, senderPublicKey: string): Promise<string> {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')

    const senderKey = decodeBase64(senderPublicKey)
    const combined = decodeBase64(encryptedMessage)

    // Extract nonce and ciphertext
    const nonce = combined.slice(0, 24)
    const ciphertext = combined.slice(24)

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      senderKey,
      this.identityKeyPair.secretKey
    )

    if (!decrypted) throw new Error('Decryption failed')

    return new TextDecoder().decode(decrypted)
  }

  /**
   * Generate safety number (fingerprint) for verification
   */
  generateSafetyNumber(theirPublicKey: string): string {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized')

    const ourKey = this.identityKeyPair.publicKey
    const theirKey = decodeBase64(theirPublicKey)

    // Combine both keys and hash
    const combined = new Uint8Array(ourKey.length + theirKey.length)
    combined.set(ourKey)
    combined.set(theirKey, ourKey.length)

    const hash = nacl.hash(combined)
    
    // Convert to readable format (12 groups of 5 digits)
    const numbers: string[] = []
    for (let i = 0; i < 60; i += 5) {
      const chunk = hash.slice(i, i + 5)
      const num = chunk.reduce((acc: number, byte: number) => acc * 256 + byte, 0 as number)
      numbers.push((num % 100000).toString().padStart(5, '0'))
    }

    return numbers.join(' ')
  }

  /**
   * Generate ephemeral key pair for anonymous matching
   */
  generateEphemeralKeyPair(): KeyPair {
    return nacl.box.keyPair()
  }

  /**
   * Clear all stored keys (for logout)
   */
  async clearKeys(): Promise<void> {
    await db.identityKeys.clear()
    await db.preKeys.clear()
    await db.sessions.clear()
    this.identityKeyPair = null
  }
}

/**
 * Hash questionnaire answers into category tags
 */
export function hashQuestionnaireAnswers(answers: Record<string, string>): string[] {
  const tags: string[] = []
  
  for (const [question, answer] of Object.entries(answers)) {
    const combined = `${question}:${answer.toLowerCase()}`
    const hash = nacl.hash(new TextEncoder().encode(combined))
    const tag = encodeBase64(hash.slice(0, 16)) // Use first 16 bytes
    tags.push(tag)
  }

  return tags
}
