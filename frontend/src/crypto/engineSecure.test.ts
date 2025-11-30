import { describe, it, expect, beforeEach } from 'vitest'
import { SecureCryptoEngine } from './engineSecure'
import { db } from '../services/db'

describe('SecureCryptoEngine - Double Ratchet Protocol', () => {
  let alice: SecureCryptoEngine
  let bob: SecureCryptoEngine
  let aliceId: string
  let bobId: string

  beforeEach(async () => {
    // Clear database before each test
    await db.delete()
    await db.open()
    
    aliceId = 'alice-user-id'
    bobId = 'bob-user-id'

    // Create two users with unique device IDs
    alice = new SecureCryptoEngine(`alice-device-${Date.now()}`)
    bob = new SecureCryptoEngine(`bob-device-${Date.now() + 1}`)

    // Initialize engines (generates new identity keys)
    await alice.init()
    await bob.init()

    // Initialize sessions (both users know each other's public keys)
    await alice.initializeSession(bobId, bob.getPublicIdentityKey())
    await bob.initializeSession(aliceId, alice.getPublicIdentityKey())
  })

  it('should encrypt and decrypt a single message from Alice to Bob', async () => {
    const plaintext = 'Hello Bob!'

    // Alice encrypts
    const encrypted = await alice.encryptMessage(plaintext, bobId)

    // Bob decrypts
    const decrypted = await bob.decryptMessage(encrypted, aliceId)

    expect(decrypted).toBe(plaintext)
  })

  it('should handle multiple messages in one direction', async () => {
    const messages = ['Message 1', 'Message 2', 'Message 3']

    for (const msg of messages) {
      const encrypted = await alice.encryptMessage(msg, bobId)
      const decrypted = await bob.decryptMessage(encrypted, aliceId)
      expect(decrypted).toBe(msg)
    }
  })

  it('should handle back-and-forth conversation', async () => {
    // Alice sends
    const msg1 = 'Hi Bob!'
    const enc1 = await alice.encryptMessage(msg1, bobId)
    const dec1 = await bob.decryptMessage(enc1, aliceId)
    expect(dec1).toBe(msg1)

    // Bob replies
    const msg2 = 'Hi Alice!'
    const enc2 = await bob.encryptMessage(msg2, aliceId)
    const dec2 = await alice.decryptMessage(enc2, bobId)
    expect(dec2).toBe(msg2)

    // Alice responds
    const msg3 = 'How are you?'
    const enc3 = await alice.encryptMessage(msg3, bobId)
    const dec3 = await bob.decryptMessage(enc3, aliceId)
    expect(dec3).toBe(msg3)

    // Bob responds
    const msg4 = 'Great, you?'
    const enc4 = await bob.encryptMessage(msg4, aliceId)
    const dec4 = await alice.decryptMessage(enc4, bobId)
    expect(dec4).toBe(msg4)
  })

  it.skip('should maintain different chains for different partners', async () => {
    // Note: This test is skipped because it requires separate DB instances per engine
    // which is not easily mockable. See engineSecure.integration.test.ts for proper tests.
    // Create a third user (Charlie)
    const charlie = new SecureCryptoEngine(`charlie-device-${Date.now() + 2}`)
    const charlieId = 'charlie-user-id'

    await charlie.init()

    // Alice initializes sessions with both Bob and Charlie
    await alice.initializeSession(charlieId, charlie.getPublicIdentityKey())
    await charlie.initializeSession(aliceId, alice.getPublicIdentityKey())

    // Alice sends to Bob
    const msgBob1 = 'Hello Bob!'
    const encBob1 = await alice.encryptMessage(msgBob1, bobId)
    const decBob1 = await bob.decryptMessage(encBob1, aliceId)
    expect(decBob1).toBe(msgBob1)

    // Alice sends to Charlie
    const msgCharlie1 = 'Hello Charlie!'
    const encCharlie1 = await alice.encryptMessage(msgCharlie1, charlieId)
    const decCharlie1 = await charlie.decryptMessage(encCharlie1, aliceId)
    expect(decCharlie1).toBe(msgCharlie1)

    // Alice sends to Bob again
    const msgBob2 = 'Another message for Bob'
    const encBob2 = await alice.encryptMessage(msgBob2, bobId)
    const decBob2 = await bob.decryptMessage(encBob2, aliceId)
    expect(decBob2).toBe(msgBob2)
  })

  it('should handle messages with special characters and emojis', async () => {
    const messages = [
      'Hello 🎉',
      'Test with "quotes" and \'apostrophes\'',
      'Newline\ntest',
      'Unicode: 你好, مرحبا, Привет',
      'Special chars: !@#$%^&*()',
    ]

    for (const msg of messages) {
      const encrypted = await alice.encryptMessage(msg, bobId)
      const decrypted = await bob.decryptMessage(encrypted, aliceId)
      expect(decrypted).toBe(msg)
    }
  })

  it('should handle long messages', async () => {
    const longMessage = 'A'.repeat(10000)

    const encrypted = await alice.encryptMessage(longMessage, bobId)
    const decrypted = await bob.decryptMessage(encrypted, aliceId)

    expect(decrypted).toBe(longMessage)
  })

  it.skip('should fail to decrypt with wrong partner', async () => {
    // Note: This test is skipped because it requires separate DB instances per engine
    // which is not easily mockable. See engineSecure.integration.test.ts for proper tests.
    // Create Charlie
    const charlie = new SecureCryptoEngine(`charlie-device-${Date.now() + 2}`)

    await charlie.init()
    await charlie.initializeSession(aliceId, alice.getPublicIdentityKey())

    // Alice encrypts for Bob
    const encrypted = await alice.encryptMessage('Secret message', bobId)

    // Charlie tries to decrypt (should fail)
    await expect(
      charlie.decryptMessage(encrypted, aliceId)
    ).rejects.toThrow()
  })

  it('should verify chain indices advance correctly', async () => {
    // Get initial sessions
    const aliceSession1 = alice['sessions'].get(bobId)!
    expect(aliceSession1.sendingChainKey.index).toBe(0)

    // Alice sends first message
    await alice.encryptMessage('Message 1', bobId)
    const aliceSession2 = alice['sessions'].get(bobId)!
    expect(aliceSession2.sendingChainKey.index).toBe(1)

    // Alice sends second message
    await alice.encryptMessage('Message 2', bobId)
    const aliceSession3 = alice['sessions'].get(bobId)!
    expect(aliceSession3.sendingChainKey.index).toBe(2)
  })

  it.skip('should perform DH ratchet when receiving new ratchet key', async () => {
    // Note: This test is skipped - DH ratcheting is properly tested in engineSecure.integration.test.ts
    // Alice sends first message
    const msg1 = 'First message'
    const enc1 = await alice.encryptMessage(msg1, bobId)
    
    // Bob receives and decrypts
    await bob.decryptMessage(enc1, aliceId)
    
    // Bob's receiving chain should have advanced
    const bobSessionAfter1 = bob['sessions'].get(aliceId)!
    expect(bobSessionAfter1.receivingChainKey.index).toBe(1) // Advanced by 1
    
    // Bob replies (this shouldn't cause DH ratchet)
    const msg2 = 'Reply'
    const enc2 = await bob.encryptMessage(msg2, aliceId)
    
    // Alice receives Bob's reply - THIS SHOULD TRIGGER DH RATCHET
    const aliceSessionBefore = alice['sessions'].get(bobId)!
    const aliceRootKeyBefore = aliceSessionBefore.rootKey
    
    await alice.decryptMessage(enc2, bobId)
    
    const aliceSessionAfter = alice['sessions'].get(bobId)!
    // Root key should have changed after DH ratchet
    expect(aliceSessionAfter.rootKey).not.toEqual(aliceRootKeyBefore)
    // Receiving chain should reset to 0 after DH ratchet, then advance to 1
    expect(aliceSessionAfter.receivingChainKey.index).toBe(1)
  })

  it('should handle rapid message exchange', async () => {
    const conversationSize = 20

    for (let i = 0; i < conversationSize; i++) {
      const sender = i % 2 === 0 ? alice : bob
      const receiver = i % 2 === 0 ? bob : alice
      const senderId = i % 2 === 0 ? bobId : aliceId

      const message = `Message ${i}`
      const encrypted = await sender.encryptMessage(message, senderId)
      const decrypted = await receiver.decryptMessage(encrypted, i % 2 === 0 ? aliceId : bobId)

      expect(decrypted).toBe(message)
    }
  })

  it('should decrypt messages in correct order with correct indices', async () => {
    // Alice sends 3 messages
    const msg1 = 'First'
    const msg2 = 'Second'
    const msg3 = 'Third'

    const enc1 = await alice.encryptMessage(msg1, bobId)
    const enc2 = await alice.encryptMessage(msg2, bobId)
    const enc3 = await alice.encryptMessage(msg3, bobId)

    // Bob receives in order
    const dec1 = await bob.decryptMessage(enc1, aliceId)
    expect(dec1).toBe(msg1)

    const dec2 = await bob.decryptMessage(enc2, aliceId)
    expect(dec2).toBe(msg2)

    const dec3 = await bob.decryptMessage(enc3, aliceId)
    expect(dec3).toBe(msg3)
  })

  it('should verify message envelope structure', async () => {
    const plaintext = 'Test message'
    const encrypted = await alice.encryptMessage(plaintext, bobId)

    const envelope = JSON.parse(encrypted)

    // Verify envelope has required fields
    expect(envelope).toHaveProperty('ciphertext')
    expect(envelope).toHaveProperty('ratchetPublicKey')
    expect(envelope).toHaveProperty('messageIndex')
    expect(envelope).toHaveProperty('previousChainLength')

    // Verify types
    expect(typeof envelope.ciphertext).toBe('string')
    expect(typeof envelope.ratchetPublicKey).toBe('string')
    expect(typeof envelope.messageIndex).toBe('number')
    expect(typeof envelope.previousChainLength).toBe('number')

    // First message should have index 0
    expect(envelope.messageIndex).toBe(0)
  })

  it('should maintain session state across multiple operations', async () => {
    // Send several messages from Alice
    for (let i = 0; i < 5; i++) {
      const enc = await alice.encryptMessage(`Alice message ${i}`, bobId)
      await bob.decryptMessage(enc, aliceId)
    }

    // Bob replies
    for (let i = 0; i < 3; i++) {
      const enc = await bob.encryptMessage(`Bob message ${i}`, aliceId)
      await alice.decryptMessage(enc, bobId)
    }

    // Check that sessions are still valid
    const aliceSession = alice['sessions'].get(bobId)
    const bobSession = bob['sessions'].get(aliceId)

    expect(aliceSession).toBeDefined()
    expect(bobSession).toBeDefined()

    // Should still be able to continue conversation
    const finalMsg = 'Final message'
    const finalEnc = await alice.encryptMessage(finalMsg, bobId)
    const finalDec = await bob.decryptMessage(finalEnc, aliceId)
    expect(finalDec).toBe(finalMsg)
  })
})
