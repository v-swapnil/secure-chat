import { describe, it, expect } from 'vitest'
import * as nacl from 'tweetnacl'
import {
  createSessionState,
  getNextSendMessageKey,
  getNextReceiveMessageKey,
  deriveMessageKeys,
  dh,
  ratchetRootKey,
  ratchetChainKey,
} from './session'

describe('Double Ratchet - Session Functions', () => {
  it('should create initial session state', () => {
    const sharedSecret = nacl.randomBytes(32)
    const ratchetKey = nacl.box.keyPair()
    const partnerKey = nacl.box.keyPair().publicKey

    const session = createSessionState('test-session', sharedSecret, ratchetKey, partnerKey)

    expect(session.sessionId).toBe('test-session')
    expect(session.rootKey).toHaveLength(32)
    expect(session.sendingChainKey.index).toBe(0)
    expect(session.receivingChainKey.index).toBe(0)
    expect(session.sendingRatchetKey).toEqual(ratchetKey)
    expect(session.receivingRatchetPublicKey).toEqual(partnerKey)
  })

  it('should perform DH correctly (symmetric)', () => {
    const alice = nacl.box.keyPair()
    const bob = nacl.box.keyPair()

    const dh1 = dh(alice.secretKey, bob.publicKey)
    const dh2 = dh(bob.secretKey, alice.publicKey)

    // DH should be symmetric
    expect(dh1).toEqual(dh2)
  })

  it('should ratchet chain key and derive message key', () => {
    const chainKey = nacl.randomBytes(32)

    const { messageKey, nextChainKey } = ratchetChainKey(chainKey)

    expect(messageKey).toHaveLength(32)
    expect(nextChainKey).toHaveLength(32)
    expect(messageKey).not.toEqual(chainKey)
    expect(nextChainKey).not.toEqual(chainKey)
    expect(messageKey).not.toEqual(nextChainKey)
  })

  it('should derive message encryption keys', () => {
    const messageKey = nacl.randomBytes(32)

    const { encryptKey, authKey, iv } = deriveMessageKeys(messageKey)

    expect(encryptKey).toHaveLength(32)
    expect(authKey).toHaveLength(32)
    expect(iv).toHaveLength(24)
  })

  it('should ratchet root key with DH output', () => {
    const rootKey = nacl.randomBytes(32)
    const dhOutput = nacl.randomBytes(32)

    const { newRootKey, newChainKey } = ratchetRootKey(rootKey, dhOutput)

    expect(newRootKey).toHaveLength(32)
    expect(newChainKey).toHaveLength(32)
    expect(newRootKey).not.toEqual(rootKey)
    expect(newChainKey).not.toEqual(rootKey)
  })

  it('should advance sending chain correctly', () => {
    const sharedSecret = nacl.randomBytes(32)
    const ratchetKey = nacl.box.keyPair()
    let session = createSessionState('test', sharedSecret, ratchetKey, null)

    expect(session.sendingChainKey.index).toBe(0)

    // Get first message key
    const result1 = getNextSendMessageKey(session)
    session = result1.newSession
    expect(session.sendingChainKey.index).toBe(1)

    // Get second message key
    const result2 = getNextSendMessageKey(session)
    session = result2.newSession
    expect(session.sendingChainKey.index).toBe(2)

    // Message keys should be different
    expect(result1.messageKey).not.toEqual(result2.messageKey)
  })

  it('should advance receiving chain correctly', () => {
    const sharedSecret = nacl.randomBytes(32)
    const ratchetKey = nacl.box.keyPair()
    let session = createSessionState('test', sharedSecret, ratchetKey, null)

    expect(session.receivingChainKey.index).toBe(0)

    // Get first message key
    const result1 = getNextReceiveMessageKey(session)
    session = result1.newSession
    expect(session.receivingChainKey.index).toBe(1)

    // Get second message key
    const result2 = getNextReceiveMessageKey(session)
    session = result2.newSession
    expect(session.receivingChainKey.index).toBe(2)

    // Message keys should be different
    expect(result1.messageKey).not.toEqual(result2.messageKey)
  })

  it('should maintain separate sending and receiving chains', () => {
    const sharedSecret = nacl.randomBytes(32)
    const ratchetKey = nacl.box.keyPair()
    let session = createSessionState('test', sharedSecret, ratchetKey, null)

    // Advance sending chain
    const sendResult = getNextSendMessageKey(session)
    session = sendResult.newSession
    expect(session.sendingChainKey.index).toBe(1)
    expect(session.receivingChainKey.index).toBe(0) // Receiving unchanged

    // Advance receiving chain
    const recvResult = getNextReceiveMessageKey(session)
    session = recvResult.newSession
    expect(session.sendingChainKey.index).toBe(1) // Sending unchanged
    expect(session.receivingChainKey.index).toBe(1)
  })

  it('should encrypt and decrypt with NaCl secretbox', () => {
    const sharedSecret = nacl.randomBytes(32)
    const ratchetKey = nacl.box.keyPair()
    const session = createSessionState('test', sharedSecret, ratchetKey, null)

    // Get message key
    const { messageKey } = getNextSendMessageKey(session)
    const { encryptKey, iv } = deriveMessageKeys(messageKey)

    // Encrypt
    const plaintext = new Uint8Array(new TextEncoder().encode('Hello World!'))
    const ciphertext = nacl.secretbox(plaintext, iv, encryptKey)
    expect(ciphertext).not.toBeNull()

    // Decrypt
    const decrypted = nacl.secretbox.open(ciphertext!, iv, encryptKey)
    expect(decrypted).not.toBeNull()

    const decryptedText = new TextDecoder().decode(decrypted!)
    expect(decryptedText).toBe('Hello World!')
  })

  it('should demonstrate full Double Ratchet flow', () => {
    // Setup: Alice and Bob generate keys
    const aliceRatchet = nacl.box.keyPair()
    const bobRatchet = nacl.box.keyPair()

    // Initial shared secret (from X3DH or similar)
    const sharedSecret = nacl.randomBytes(32)

    // Alice's session (initiator - no partner key initially)
    let aliceSession = createSessionState('bob', sharedSecret, aliceRatchet, null)

    // Bob's session (responder - has Alice's key)
    let bobSession = createSessionState('alice', sharedSecret, bobRatchet, aliceRatchet.publicKey)

    // Alice sends first message
    const aliceSend1 = getNextSendMessageKey(aliceSession)
    aliceSession = aliceSend1.newSession
    const aliceMsg1Key = deriveMessageKeys(aliceSend1.messageKey)
    
    const msg1 = new Uint8Array(new TextEncoder().encode('Hello Bob'))
    const enc1 = nacl.secretbox(msg1, aliceMsg1Key.iv, aliceMsg1Key.encryptKey)!

    // Bob receives (uses initial receiving chain - no DH ratchet yet)
    const bobRecv1 = getNextReceiveMessageKey(bobSession)
    bobSession = bobRecv1.newSession
    const bobMsg1Key = deriveMessageKeys(bobRecv1.messageKey)

    const dec1 = nacl.secretbox.open(enc1, bobMsg1Key.iv, bobMsg1Key.encryptKey)
    expect(dec1).not.toBeNull()
    expect(new TextDecoder().decode(dec1!)).toBe('Hello Bob')

    // Verify: Both used the SAME initial chain key
    expect(aliceSession.sendingChainKey.index).toBe(1) // Alice advanced her sending chain
    expect(bobSession.receivingChainKey.index).toBe(1) // Bob advanced his receiving chain
  })

  it('should test symmetric chain keys between sender and receiver', () => {
    // Same shared secret and initial setup
    const sharedSecret = nacl.randomBytes(32)
    const aliceRatchet = nacl.box.keyPair()
    const bobRatchet = nacl.box.keyPair()

    // Both start with same root key derived from shared secret
    const aliceSession = createSessionState('bob', sharedSecret, aliceRatchet, null)
    const bobSession = createSessionState('alice', sharedSecret, bobRatchet, aliceRatchet.publicKey)

    // Initial chains should be identical
    expect(aliceSession.sendingChainKey.key).toEqual(bobSession.receivingChainKey.key)
    expect(aliceSession.receivingChainKey.key).toEqual(bobSession.sendingChainKey.key)

    // After Alice sends, her sending chain advances
    const { messageKey: aliceKey } = getNextSendMessageKey(aliceSession)

    // When Bob receives, his receiving chain advances
    const { messageKey: bobKey } = getNextReceiveMessageKey(bobSession)

    // The message keys should be IDENTICAL
    expect(aliceKey).toEqual(bobKey)
  })

  it('should demonstrate DH ratchet creates new chains', () => {
    const sharedSecret = nacl.randomBytes(32)
    const aliceRatchet1 = nacl.box.keyPair()
    const bobRatchet = nacl.box.keyPair()

    let session = createSessionState('test', sharedSecret, aliceRatchet1, bobRatchet.publicKey)
    const originalRootKey = session.rootKey
    const originalSendingChain = session.sendingChainKey.key

    // Simulate Alice performing DH ratchet (receiving Bob's new key)
    const bobNewRatchet = nacl.box.keyPair()

    // Alice does DH with her current key and Bob's new key
    const dhOutput = dh(session.sendingRatchetKey.secretKey, bobNewRatchet.publicKey)
    const { newRootKey, newChainKey } = ratchetRootKey(session.rootKey, dhOutput)

    // Update receiving chain
    session = {
      ...session,
      rootKey: newRootKey,
      receivingChainKey: { key: newChainKey, index: 0 },
      receivingRatchetPublicKey: bobNewRatchet.publicKey,
    }

    // Alice generates new sending ratchet key
    const aliceRatchet2 = nacl.box.keyPair()
    const dhOutput2 = dh(aliceRatchet2.secretKey, bobNewRatchet.publicKey)
    const { newRootKey: finalRootKey, newChainKey: newSendingChainKey } = ratchetRootKey(newRootKey, dhOutput2)

    session = {
      ...session,
      rootKey: finalRootKey,
      sendingChainKey: { key: newSendingChainKey, index: 0 },
      sendingRatchetKey: aliceRatchet2,
    }

    // Verify everything changed
    expect(session.rootKey).not.toEqual(originalRootKey)
    expect(session.sendingChainKey.key).not.toEqual(originalSendingChain)
    expect(session.sendingChainKey.index).toBe(0) // Reset to 0
    expect(session.receivingChainKey.index).toBe(0) // Reset to 0
  })
})
