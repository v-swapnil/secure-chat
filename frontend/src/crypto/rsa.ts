/**
 * RSA encryption utilities for encrypting prekey bundles
 * Uses Web Crypto API with RSA-OAEP SHA-256
 */

/**
 * Import RSA public key from PEM format
 */
export async function importRSAPublicKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM headers and whitespace
  const pemContents = pemKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '')
  
  // Convert base64 to binary
  const binaryDer = atob(pemContents)
  const bytes = new Uint8Array(binaryDer.length)
  for (let i = 0; i < binaryDer.length; i++) {
    bytes[i] = binaryDer.charCodeAt(i)
  }
  
  // Import as CryptoKey
  return await crypto.subtle.importKey(
    'spki',
    bytes,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  )
}

/**
 * Encrypt data with RSA-OAEP public key
 */
export async function rsaEncrypt(
  publicKey: CryptoKey,
  data: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const dataBytes = encoder.encode(data)
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    dataBytes
  )
  
  return new Uint8Array(encrypted)
}

/**
 * Fetch server's RSA public key
 */
export async function fetchServerPublicKey(): Promise<CryptoKey> {
  const response = await fetch('http://localhost:8081/auth/server-pubkey')
  if (!response.ok) {
    throw new Error('Failed to fetch server public key')
  }
  const data = await response.json()
  return await importRSAPublicKey(data.public_key)
}
