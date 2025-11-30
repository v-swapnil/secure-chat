import * as nacl from 'tweetnacl'
import { encodeBase64, decodeBase64 } from 'tweetnacl-util'

/**
 * Session state for Double Ratchet-like protocol
 * Provides forward secrecy and post-compromise security
 */

export interface ChainKey {
  key: Uint8Array
  index: number
}

export interface MessageKeys {
  encryptKey: Uint8Array
  authKey: Uint8Array
  iv: Uint8Array
}

export interface SessionState {
  sessionId: string
  rootKey: Uint8Array
  sendingChainKey: ChainKey
  receivingChainKey: ChainKey
  sendingRatchetKey: nacl.BoxKeyPair
  receivingRatchetPublicKey: Uint8Array | null
  previousSendingChainLength: number
  skippedMessageKeys: Map<string, MessageKeys>
  createdAt: number
  lastUsed: number
}

/**
 * Key Derivation Function using HKDF-like approach with NaCl
 */
export function deriveKeys(inputKeyMaterial: Uint8Array, salt: Uint8Array, info: string): Uint8Array {
  // Combine IKM, salt, and info
  const combined = new Uint8Array(inputKeyMaterial.length + salt.length + info.length)
  combined.set(inputKeyMaterial, 0)
  combined.set(salt, inputKeyMaterial.length)
  combined.set(new TextEncoder().encode(info), inputKeyMaterial.length + salt.length)
  
  // Hash to derive key material
  return nacl.hash(combined).slice(0, 32)
}

/**
 * Perform Diffie-Hellman key exchange
 */
export function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return nacl.scalarMult(privateKey, publicKey)
}

/**
 * Initialize root key from initial shared secret
 */
export function initializeRootKey(sharedSecret: Uint8Array): Uint8Array {
  const salt = new Uint8Array(32) // Zero salt for initial root key
  return deriveKeys(sharedSecret, salt, 'RootKey')
}

/**
 * Ratchet root key and derive new chain key
 */
export function ratchetRootKey(
  rootKey: Uint8Array,
  dhOutput: Uint8Array
): { newRootKey: Uint8Array; newChainKey: Uint8Array } {
  const salt = rootKey
  const derived = nacl.hash(new Uint8Array([...salt, ...dhOutput]))
  
  return {
    newRootKey: derived.slice(0, 32),
    newChainKey: derived.slice(32, 64),
  }
}

/**
 * Ratchet chain key to get message key and next chain key
 */
export function ratchetChainKey(chainKey: Uint8Array): {
  messageKey: Uint8Array
  nextChainKey: Uint8Array
} {
  const messageKeySeed = new Uint8Array([0x01, ...chainKey])
  const chainKeySeed = new Uint8Array([0x02, ...chainKey])
  
  return {
    messageKey: nacl.hash(messageKeySeed).slice(0, 32),
    nextChainKey: nacl.hash(chainKeySeed).slice(0, 32),
  }
}

/**
 * Derive message encryption keys from message key
 */
export function deriveMessageKeys(messageKey: Uint8Array): MessageKeys {
  const hash = nacl.hash(messageKey)
  
  return {
    encryptKey: new Uint8Array(hash.slice(0, 32)),    // Bytes 0-31: Encryption key (32 bytes)
    authKey: new Uint8Array(hash.slice(32, 64)),      // Bytes 32-63: Auth key (32 bytes)  
    iv: new Uint8Array(hash.slice(40, 64)),           // Bytes 40-63: IV (24 bytes, overlaps with authKey)
  }
}

/**
 * Create initial session state
 */
export function createSessionState(
  sessionId: string,
  sharedSecret: Uint8Array,
  sendingRatchetKey: nacl.BoxKeyPair,
  receivingRatchetPublicKey: Uint8Array | null
): SessionState {
  const rootKey = initializeRootKey(sharedSecret)
  const initialChainKey = deriveKeys(rootKey, new Uint8Array(32), 'ChainKey')
  
  return {
    sessionId,
    rootKey,
    sendingChainKey: { key: initialChainKey, index: 0 },
    receivingChainKey: { key: initialChainKey, index: 0 },
    sendingRatchetKey,
    receivingRatchetPublicKey,
    previousSendingChainLength: 0,
    skippedMessageKeys: new Map(),
    createdAt: Date.now(),
    lastUsed: Date.now(),
  }
}

/**
 * Perform DH ratchet step (sending)
 */
export function dhRatchetSend(session: SessionState): SessionState {
  // Generate new ephemeral key pair
  const newRatchetKey = nacl.box.keyPair()
  
  if (session.receivingRatchetPublicKey) {
    // Perform DH with receiver's public key
    const dhOutput = dh(newRatchetKey.secretKey, session.receivingRatchetPublicKey)
    
    // Ratchet root key
    const { newRootKey, newChainKey } = ratchetRootKey(session.rootKey, dhOutput)
    
    return {
      ...session,
      rootKey: newRootKey,
      sendingChainKey: { key: newChainKey, index: 0 },
      sendingRatchetKey: newRatchetKey,
      previousSendingChainLength: session.sendingChainKey.index,
      lastUsed: Date.now(),
    }
  }
  
  return session
}

/**
 * Perform DH ratchet step (receiving)
 */
export function dhRatchetReceive(
  session: SessionState,
  newPublicKey: Uint8Array
): SessionState {
  // Perform DH with new public key
  const dhOutput = dh(session.sendingRatchetKey.secretKey, newPublicKey)
  
  // Ratchet root key
  const { newRootKey, newChainKey } = ratchetRootKey(session.rootKey, dhOutput)
  
  return {
    ...session,
    rootKey: newRootKey,
    receivingChainKey: { key: newChainKey, index: 0 },
    receivingRatchetPublicKey: newPublicKey,
    lastUsed: Date.now(),
  }
}

/**
 * Get next message key for sending
 */
export function getNextSendMessageKey(session: SessionState): {
  messageKey: Uint8Array
  newSession: SessionState
} {
  const { messageKey, nextChainKey } = ratchetChainKey(session.sendingChainKey.key)
  
  const newSession = {
    ...session,
    sendingChainKey: {
      key: nextChainKey,
      index: session.sendingChainKey.index + 1,
    },
    lastUsed: Date.now(),
  }
  
  return { messageKey, newSession }
}

/**
 * Get next message key for receiving
 */
export function getNextReceiveMessageKey(session: SessionState): {
  messageKey: Uint8Array
  newSession: SessionState
} {
  const { messageKey, nextChainKey } = ratchetChainKey(session.receivingChainKey.key)
  
  const newSession = {
    ...session,
    receivingChainKey: {
      key: nextChainKey,
      index: session.receivingChainKey.index + 1,
    },
    lastUsed: Date.now(),
  }
  
  return { messageKey, newSession }
}

/**
 * Serialize session state for storage
 */
export function serializeSession(session: SessionState): string {
  const serializable = {
    sessionId: session.sessionId,
    rootKey: encodeBase64(session.rootKey),
    sendingChainKey: {
      key: encodeBase64(session.sendingChainKey.key),
      index: session.sendingChainKey.index,
    },
    receivingChainKey: {
      key: encodeBase64(session.receivingChainKey.key),
      index: session.receivingChainKey.index,
    },
    sendingRatchetKey: {
      publicKey: encodeBase64(session.sendingRatchetKey.publicKey),
      secretKey: encodeBase64(session.sendingRatchetKey.secretKey),
    },
    receivingRatchetPublicKey: session.receivingRatchetPublicKey
      ? encodeBase64(session.receivingRatchetPublicKey)
      : null,
    previousSendingChainLength: session.previousSendingChainLength,
    createdAt: session.createdAt,
    lastUsed: session.lastUsed,
  }
  
  return JSON.stringify(serializable)
}

/**
 * Deserialize session state from storage
 */
export function deserializeSession(data: string): SessionState {
  const parsed = JSON.parse(data)
  
  return {
    sessionId: parsed.sessionId,
    rootKey: decodeBase64(parsed.rootKey),
    sendingChainKey: {
      key: decodeBase64(parsed.sendingChainKey.key),
      index: parsed.sendingChainKey.index,
    },
    receivingChainKey: {
      key: decodeBase64(parsed.receivingChainKey.key),
      index: parsed.receivingChainKey.index,
    },
    sendingRatchetKey: {
      publicKey: decodeBase64(parsed.sendingRatchetKey.publicKey),
      secretKey: decodeBase64(parsed.sendingRatchetKey.secretKey),
    },
    receivingRatchetPublicKey: parsed.receivingRatchetPublicKey
      ? decodeBase64(parsed.receivingRatchetPublicKey)
      : null,
    previousSendingChainLength: parsed.previousSendingChainLength,
    skippedMessageKeys: new Map(),
    createdAt: parsed.createdAt,
    lastUsed: parsed.lastUsed,
  }
}
