import 'react-native-get-random-values';
import * as nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import * as Keychain from 'react-native-keychain';
import { KEYCHAIN_SERVICE } from '@/config';
import type { KeyPair } from '@/types';

/**
 * Mobile-optimized E2EE implementation using NaCl
 * - Uses react-native-get-random-values for secure random generation
 * - Stores keys in device Keychain/Keystore
 * - Keeps session keys in memory only
 */

export class MobileCryptoEngine {
  private identityKeyPair: KeyPair | null = null;
  private deviceId: string;
  private sessionKeys: Map<string, Uint8Array> = new Map(); // In-memory only

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  /**
   * Initialize or load identity key pair from secure storage
   */
  async init(): Promise<void> {
    try {
      // Try to load from Keychain
      const credentials = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });

      if (credentials) {
        const keyData = JSON.parse(credentials.password);
        this.identityKeyPair = {
          publicKey: new Uint8Array(Object.values(keyData.publicKey)),
          secretKey: new Uint8Array(Object.values(keyData.secretKey)),
        };
      } else {
        // Generate new key pair
        await this.generateAndStoreIdentityKey();
      }
    } catch (error) {
      console.error('Failed to initialize crypto engine:', error);
      throw error;
    }
  }

  /**
   * Generate new identity key and store securely
   */
  private async generateAndStoreIdentityKey(): Promise<void> {
    this.identityKeyPair = nacl.box.keyPair();

    // Store in Keychain (iOS) / Keystore (Android)
    await Keychain.setGenericPassword(
      'identity_key',
      JSON.stringify({
        publicKey: Array.from(this.identityKeyPair.publicKey),
        secretKey: Array.from(this.identityKeyPair.secretKey),
      }),
      {
        service: KEYCHAIN_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
        securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      }
    );
  }

  /**
   * Get public identity key as base64
   */
  getPublicIdentityKey(): string {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized');
    return encodeBase64(this.identityKeyPair.publicKey);
  }

  /**
   * Generate pre-keys (offline support)
   */
  async generatePreKeys(count: number = 100): Promise<any[]> {
    const preKeys = [];
    for (let i = 0; i < count; i++) {
      const keyPair = nacl.box.keyPair();
      
      // Store in Keychain with unique identifier
      await Keychain.setGenericPassword(
        `prekey_${i}`,
        JSON.stringify({
          pubKey: Array.from(keyPair.publicKey),
          privKey: Array.from(keyPair.secretKey),
        }),
        {
          service: `${KEYCHAIN_SERVICE}.prekeys`,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
        }
      );

      preKeys.push({
        keyId: i,
        publicKey: encodeBase64(keyPair.publicKey),
      });
    }
    return preKeys;
  }

  /**
   * Generate signed pre-key
   */
  async generateSignedPreKey(): Promise<any> {
    const keyPair = nacl.box.keyPair();
    const signature = 'mock-signature'; // In production, sign with identity key

    await Keychain.setGenericPassword(
      'signed_prekey',
      JSON.stringify({
        pubKey: Array.from(keyPair.publicKey),
        privKey: Array.from(keyPair.secretKey),
      }),
      {
        service: `${KEYCHAIN_SERVICE}.signed`,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
        securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      }
    );

    return {
      keyId: -1,
      publicKey: encodeBase64(keyPair.publicKey),
      signature,
      isSigned: true,
    };
  }

  /**
   * Encrypt a message to recipient
   */
  async encryptMessage(message: string, recipientPublicKey: string): Promise<string> {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized');

    const recipientKey = decodeBase64(recipientPublicKey);
    const messageBytes = new TextEncoder().encode(message);
    const nonce = nacl.randomBytes(24);

    const encrypted = nacl.box(
      messageBytes,
      nonce,
      recipientKey,
      this.identityKeyPair.secretKey
    );

    // Combine nonce and ciphertext
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);

    return encodeBase64(combined);
  }

  /**
   * Decrypt a message from sender
   */
  async decryptMessage(encryptedMessage: string, senderPublicKey: string): Promise<string> {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized');

    const senderKey = decodeBase64(senderPublicKey);
    const combined = decodeBase64(encryptedMessage);

    // Extract nonce and ciphertext
    const nonce = combined.slice(0, 24);
    const ciphertext = combined.slice(24);

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      senderKey,
      this.identityKeyPair.secretKey
    );

    if (!decrypted) throw new Error('Decryption failed');

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Generate safety number (fingerprint) for verification
   */
  generateSafetyNumber(theirPublicKey: string): string {
    if (!this.identityKeyPair) throw new Error('Identity key not initialized');

    const ourKey = this.identityKeyPair.publicKey;
    const theirKey = decodeBase64(theirPublicKey);

    // Combine both keys and hash
    const combined = new Uint8Array(ourKey.length + theirKey.length);
    combined.set(ourKey);
    combined.set(theirKey, ourKey.length);

    const hash = nacl.hash(combined);

    // Convert to readable format (12 groups of 5 digits)
    const numbers: string[] = [];
    for (let i = 0; i < 60; i += 5) {
      const chunk = hash.slice(i, i + 5);
      const num = chunk.reduce((acc: number, byte: number) => acc * 256 + byte, 0);
      numbers.push((num % 100000).toString().padStart(5, '0'));
    }

    return numbers.join(' ');
  }

  /**
   * Generate ephemeral key pair for anonymous matching
   */
  generateEphemeralKeyPair(): KeyPair {
    return nacl.box.keyPair();
  }

  /**
   * Store temporary session key in memory only
   */
  storeSessionKey(sessionId: string, key: Uint8Array): void {
    this.sessionKeys.set(sessionId, key);
  }

  /**
   * Get temporary session key from memory
   */
  getSessionKey(sessionId: string): Uint8Array | undefined {
    return this.sessionKeys.get(sessionId);
  }

  /**
   * Clear session key from memory
   */
  clearSessionKey(sessionId: string): void {
    this.sessionKeys.delete(sessionId);
  }

  /**
   * Clear all session keys from memory
   */
  clearAllSessionKeys(): void {
    this.sessionKeys.clear();
  }

  /**
   * Clear all stored keys (for logout)
   */
  async clearAllKeys(): Promise<void> {
    try {
      // Clear identity key
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });

      // Clear pre-keys
      await Keychain.resetGenericPassword({ service: `${KEYCHAIN_SERVICE}.prekeys` });

      // Clear signed pre-key
      await Keychain.resetGenericPassword({ service: `${KEYCHAIN_SERVICE}.signed` });

      // Clear session keys from memory
      this.clearAllSessionKeys();

      this.identityKeyPair = null;
    } catch (error) {
      console.error('Failed to clear keys:', error);
      throw error;
    }
  }

  /**
   * Check if keys are initialized
   */
  isInitialized(): boolean {
    return this.identityKeyPair !== null;
  }
}

/**
 * Hash questionnaire answers into category tags
 */
export function hashQuestionnaireAnswers(answers: Record<string, string>): string[] {
  const tags: string[] = [];

  for (const [question, answer] of Object.entries(answers)) {
    const combined = `${question}:${answer.toLowerCase()}`;
    const hash = nacl.hash(new TextEncoder().encode(combined));
    const tag = encodeBase64(hash.slice(0, 16));
    tags.push(tag);
  }

  return tags;
}

/**
 * Generate QR code data for safety number verification
 */
export function generateQRCodeData(safetyNumber: string, userId: string): string {
  return JSON.stringify({
    safetyNumber,
    userId,
    timestamp: Date.now(),
  });
}

/**
 * Verify QR code data
 */
export function verifyQRCodeData(qrData: string): { safetyNumber: string; userId: string } | null {
  try {
    const data = JSON.parse(qrData);
    if (data.safetyNumber && data.userId && data.timestamp) {
      // Check if QR code is not too old (5 minutes)
      if (Date.now() - data.timestamp < 5 * 60 * 1000) {
        return { safetyNumber: data.safetyNumber, userId: data.userId };
      }
    }
    return null;
  } catch {
    return null;
  }
}
