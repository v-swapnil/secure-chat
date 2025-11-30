import { describe, it, expect } from 'vitest'
import { CryptoEngine, hashQuestionnaireAnswers } from './engine'

// Legacy crypto engine tests - replaced by engineSecure.ts
describe.skip('CryptoEngine', () => {
  it('should generate identity key pair', async () => {
    const crypto = new CryptoEngine('test-device')
    await crypto.init()
    const publicKey = crypto.getPublicIdentityKey()
    expect(publicKey).toBeDefined()
    expect(publicKey.length).toBeGreaterThan(0)
  })

  it('should generate pre-keys', async () => {
    const crypto = new CryptoEngine('test-device')
    await crypto.init()
    const preKeys = await crypto.generatePreKeys(10)
    expect(preKeys).toHaveLength(10)
    preKeys.forEach(key => {
      expect(key.keyId).toBeDefined()
      expect(key.publicKey).toBeDefined()
    })
  })

  it('should encrypt and decrypt messages', async () => {
    const crypto1 = new CryptoEngine('device-1')
    const crypto2 = new CryptoEngine('device-2')
    
    await crypto1.init()
    await crypto2.init()

    const message = 'Hello, secure world!'
    const encrypted = await crypto1.encryptMessage(message, crypto2.getPublicIdentityKey())
    const decrypted = await crypto2.decryptMessage(encrypted, crypto1.getPublicIdentityKey())

    expect(decrypted).toBe(message)
  })

  it('should generate safety numbers', async () => {
    const crypto1 = new CryptoEngine('device-1')
    const crypto2 = new CryptoEngine('device-2')
    
    await crypto1.init()
    await crypto2.init()

    const safetyNumber1 = crypto1.generateSafetyNumber(crypto2.getPublicIdentityKey())
    const safetyNumber2 = crypto2.generateSafetyNumber(crypto1.getPublicIdentityKey())

    expect(safetyNumber1).toBe(safetyNumber2)
    expect(safetyNumber1.length).toBeGreaterThan(0)
  })
})

describe.skip('hashQuestionnaireAnswers', () => {
  it('should hash answers into category tags', () => {
    const answers = {
      interests: 'Technology',
      age: '25-35',
    }
    const tags = hashQuestionnaireAnswers(answers)
    expect(tags).toHaveLength(2)
    tags.forEach(tag => {
      expect(tag.length).toBeGreaterThan(0)
    })
  })

  it('should produce consistent hashes', () => {
    const answers = {
      interests: 'Technology',
    }
    const tags1 = hashQuestionnaireAnswers(answers)
    const tags2 = hashQuestionnaireAnswers(answers)
    expect(tags1).toEqual(tags2)
  })
})
