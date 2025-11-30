import { describe, it, expect, beforeEach } from 'vitest'
import { SecureCryptoEngine } from './engineSecure'
import { encodeBase64 } from 'tweetnacl-util'
import * as nacl from 'tweetnacl'

describe('SecureCryptoEngine - Integration Tests', () => {
  let alice: SecureCryptoEngine
  let bob: SecureCryptoEngine
  let aliceId: string
  let bobId: string

  beforeEach(async () => {
    aliceId = 'alice-user-id'
    bobId = 'bob-user-id'

    // Create two users
    alice = new SecureCryptoEngine(`alice-${Date.now()}`)
    bob = new SecureCryptoEngine(`bob-${Date.now() + 1}`)

    // Manually set up their identity keys (bypassing DB)
    const aliceKeys = nacl.box.keyPair()
    const bobKeys = nacl.box.keyPair()

    alice['identityKeyPair'] = aliceKeys
    alice['signingKeyPair'] = nacl.sign.keyPair()
    bob['identityKeyPair'] = bobKeys
    bob['signingKeyPair'] = nacl.sign.keyPair()

    // Initialize sessions
    await alice.initializeSession(bobId, encodeBase64(bobKeys.publicKey))
    await bob.initializeSession(aliceId, encodeBase64(aliceKeys.publicKey))
  })

  it('should encrypt and decrypt a single message', async () => {
    const plaintext = 'Hello Bob!'

    // Alice encrypts
    const encrypted = await alice.encryptMessage(plaintext, bobId)
    console.log('Encrypted envelope:', encrypted)

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
    console.log('Alice -> Bob (1):', JSON.parse(enc1))
    const dec1 = await bob.decryptMessage(enc1, aliceId)
    expect(dec1).toBe(msg1)

    // Bob replies
    const msg2 = 'Hi Alice!'
    const enc2 = await bob.encryptMessage(msg2, aliceId)
    console.log('Bob -> Alice (1):', JSON.parse(enc2))
    const dec2 = await alice.decryptMessage(enc2, bobId)
    expect(dec2).toBe(msg2)

    // Alice responds
    const msg3 = 'How are you?'
    const enc3 = await alice.encryptMessage(msg3, bobId)
    console.log('Alice -> Bob (2):', JSON.parse(enc3))
    const dec3 = await bob.decryptMessage(enc3, aliceId)
    expect(dec3).toBe(msg3)

    // Bob responds
    const msg4 = 'Great, you?'
    const enc4 = await bob.encryptMessage(msg4, aliceId)
    console.log('Bob -> Alice (2):', JSON.parse(enc4))
    const dec4 = await alice.decryptMessage(enc4, bobId)
    expect(dec4).toBe(msg4)

    // Continue conversation
    const msg5 = 'Doing well!'
    const enc5 = await alice.encryptMessage(msg5, bobId)
    const dec5 = await bob.decryptMessage(enc5, aliceId)
    expect(dec5).toBe(msg5)
  })

  it('should verify message envelope structure', async () => {
    const plaintext = 'Test message'
    const encrypted = await alice.encryptMessage(plaintext, bobId)

    const envelope = JSON.parse(encrypted)
    console.log('Message envelope:', envelope)

    expect(envelope).toHaveProperty('ciphertext')
    expect(envelope).toHaveProperty('ratchetPublicKey')
    expect(envelope).toHaveProperty('messageIndex')
    expect(envelope).toHaveProperty('previousChainLength')

    expect(typeof envelope.ciphertext).toBe('string')
    expect(typeof envelope.ratchetPublicKey).toBe('string')
    expect(typeof envelope.messageIndex).toBe('number')
    expect(typeof envelope.previousChainLength).toBe('number')

    // First message should have index 0
    expect(envelope.messageIndex).toBe(0)
  })

  it('should track chain indices correctly', async () => {
    // Alice's initial state
    const aliceSession1 = alice['sessions'].get(bobId)!
    console.log('Alice initial:', {
      sendingChainIndex: aliceSession1.sendingChainKey.index,
      receivingChainIndex: aliceSession1.receivingChainKey.index,
    })
    expect(aliceSession1.sendingChainKey.index).toBe(0)

    // Alice sends first message
    const enc1 = await alice.encryptMessage('Message 1', bobId)
    const envelope1 = JSON.parse(enc1)
    console.log('After Alice sends 1:', {
      messageIndex: envelope1.messageIndex,
      aliceSendingIndex: alice['sessions'].get(bobId)!.sendingChainKey.index,
    })

    // Alice sends second message
    const enc2 = await alice.encryptMessage('Message 2', bobId)
    const envelope2 = JSON.parse(enc2)
    console.log('After Alice sends 2:', {
      messageIndex: envelope2.messageIndex,
      aliceSendingIndex: alice['sessions'].get(bobId)!.sendingChainKey.index,
    })

    // Indices should increment
    expect(envelope1.messageIndex).toBe(0)
    expect(envelope2.messageIndex).toBe(1)

    // Bob receives both
    await bob.decryptMessage(enc1, aliceId)
    console.log('After Bob receives 1:', {
      bobReceivingIndex: bob['sessions'].get(aliceId)!.receivingChainKey.index,
    })

    await bob.decryptMessage(enc2, aliceId)
    console.log('After Bob receives 2:', {
      bobReceivingIndex: bob['sessions'].get(aliceId)!.receivingChainKey.index,
    })
  })

  it('should verify session state after messages', async () => {
    console.log('\n=== Initial State ===')
    const aliceInit = alice['sessions'].get(bobId)!
    const bobInit = bob['sessions'].get(aliceId)!
    console.log('Alice session:', {
      sendingChainIndex: aliceInit.sendingChainKey.index,
      receivingChainIndex: aliceInit.receivingChainKey.index,
      hasReceivingRatchetKey: !!aliceInit.receivingRatchetPublicKey,
    })
    console.log('Bob session:', {
      sendingChainIndex: bobInit.sendingChainKey.index,
      receivingChainIndex: bobInit.receivingChainKey.index,
      hasReceivingRatchetKey: !!bobInit.receivingRatchetPublicKey,
    })

    // Alice sends
    console.log('\n=== Alice sends message ===')
    const msg1 = 'Hello'
    const enc1 = await alice.encryptMessage(msg1, bobId)
    const env1 = JSON.parse(enc1)
    console.log('Envelope:', env1)
    
    const aliceAfterSend = alice['sessions'].get(bobId)!
    console.log('Alice after send:', {
      sendingChainIndex: aliceAfterSend.sendingChainKey.index,
      receivingChainIndex: aliceAfterSend.receivingChainKey.index,
    })

    // Bob receives
    console.log('\n=== Bob receives message ===')
    const dec1 = await bob.decryptMessage(enc1, aliceId)
    expect(dec1).toBe(msg1)
    
    const bobAfterRecv = bob['sessions'].get(aliceId)!
    console.log('Bob after receive:', {
      sendingChainIndex: bobAfterRecv.sendingChainKey.index,
      receivingChainIndex: bobAfterRecv.receivingChainKey.index,
      hasReceivingRatchetKey: !!bobAfterRecv.receivingRatchetPublicKey,
    })

    // Bob replies
    console.log('\n=== Bob sends reply ===')
    const msg2 = 'Hi'
    const enc2 = await bob.encryptMessage(msg2, aliceId)
    const env2 = JSON.parse(enc2)
    console.log('Envelope:', env2)
    
    const bobAfterSend = bob['sessions'].get(aliceId)!
    console.log('Bob after send:', {
      sendingChainIndex: bobAfterSend.sendingChainKey.index,
      receivingChainIndex: bobAfterSend.receivingChainKey.index,
    })

    // Alice receives reply
    console.log('\n=== Alice receives reply ===')
    const dec2 = await alice.decryptMessage(enc2, bobId)
    expect(dec2).toBe(msg2)
    
    const aliceAfterRecv = alice['sessions'].get(bobId)!
    console.log('Alice after receive:', {
      sendingChainIndex: aliceAfterRecv.sendingChainKey.index,
      receivingChainIndex: aliceAfterRecv.receivingChainKey.index,
      rootKeyChanged: aliceAfterRecv.rootKey !== aliceInit.rootKey,
    })
  })

  it('should test the exact scenario from logs', async () => {
    console.log('\n=== Simulating exact scenario ===')
    
    // Send 3 messages from Alice without Bob replying
    const messages = ['msg1', 'msg2', 'msg3']
    const envelopes = []
    
    for (let i = 0; i < messages.length; i++) {
      const enc = await alice.encryptMessage(messages[i], bobId)
      const env = JSON.parse(enc)
      envelopes.push(env)
      console.log(`\nAlice message ${i + 1}:`, {
        messageIndex: env.messageIndex,
        ratchetKeySubstring: env.ratchetPublicKey.substring(0, 20),
        aliceState: {
          sendingChainIndex: alice['sessions'].get(bobId)!.sendingChainKey.index,
          receivingChainIndex: alice['sessions'].get(bobId)!.receivingChainKey.index,
        }
      })
    }

    // Verify all use same ratchet key (should be true - no DH ratchet without receiving reply)
    const firstRatchetKey = envelopes[0].ratchetPublicKey
    const allSameKey = envelopes.every(env => env.ratchetPublicKey === firstRatchetKey)
    console.log('\nAll messages use same ratchet key?', allSameKey)
    expect(allSameKey).toBe(true)

    // Verify message indices increment
    expect(envelopes[0].messageIndex).toBe(0)
    expect(envelopes[1].messageIndex).toBe(1)
    expect(envelopes[2].messageIndex).toBe(2)

    // Bob receives all messages
    console.log('\n=== Bob receiving messages ===')
    for (let i = 0; i < messages.length; i++) {
      const enc = JSON.stringify(envelopes[i])
      console.log(`\nBefore receiving message ${i + 1}:`, {
        bobState: {
          receivingChainIndex: bob['sessions'].get(aliceId)!.receivingChainKey.index,
          hasReceivingRatchetKey: !!bob['sessions'].get(aliceId)!.receivingRatchetPublicKey,
        }
      })
      
      const dec = await bob.decryptMessage(enc, aliceId)
      expect(dec).toBe(messages[i])
      
      console.log(`After receiving message ${i + 1}:`, {
        bobState: {
          receivingChainIndex: bob['sessions'].get(aliceId)!.receivingChainKey.index,
        }
      })
    }
  })
})
