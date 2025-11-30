import api from './api'
import type { PreKeyBundle } from '../types'

export interface RegisterRequest {
  identifier: string
}

export interface Verify2FARequest {
  identifier: string
  otp: string
  identity_pubkey: string
}

export interface LoginResponse {
  token: string
  user_id: string
  status: string
}

export interface UploadKeysRequest {
  identity_pub: string
  signing_pub: string
  signed_prekey: string
  signed_prekey_signature: string
  one_time_prekeys: string[]
  device_id: string
  device_pubkey: string
}

export interface MatchRequest {
  tag_hash: string
}

export interface KeyBundleResponse {
  user_id: string
  identity_pub: string
  signed_prekey: string
  signed_prekey_signature: string
  one_time_prekey?: string
  devices: Array<{
    device_id: string
    device_pubkey: string
  }>
}

export const authService = {
  async register(identifier: string): Promise<{ status: string; otp: string }> {
    const response = await api.post('/auth/register', { identifier })
    return response.data
  },

  async verify2FA(data: Verify2FARequest): Promise<LoginResponse> {
    const response = await api.post('/auth/verify-2fa', data)
    // Store token in localStorage
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token)
    }
    return response.data
  },

  async uploadPreKeys(bundle: UploadKeysRequest): Promise<{ status: string }> {
    const response = await api.post('/api/keys/prekeys/upload', bundle)
    return response.data
  },

  async getKeyBundle(userId: string): Promise<KeyBundleResponse> {
    const response = await api.get(`/api/keys/bundle/${userId}`)
    return response.data
  },

  async joinMatchQueue(tagHash: string): Promise<{ status: string }> {
    const response = await api.post('/api/match/enqueue', {
      tag_hash: tagHash,
    })
    return response.data
  },

  async getMatchStatus(): Promise<{ status: string; pair_id?: string }> {
    const response = await api.get('/api/match/status')
    return response.data
  },

  async leaveMatchQueue(): Promise<void> {
    // TODO: implement leave queue endpoint if needed
  },

  // Legacy compatibility
  async getPreKeyBundle(userId: string): Promise<PreKeyBundle> {
    const bundle = await this.getKeyBundle(userId)
    return {
      userId: bundle.user_id,
      deviceId: bundle.devices[0]?.device_id || 'default',
      identityKey: bundle.identity_pub,
      signedPrekey: {
        id: 1,
        userId: bundle.user_id,
        deviceId: bundle.devices[0]?.device_id || 'default',
        keyId: 1,
        publicKey: bundle.signed_prekey,
        signature: bundle.signed_prekey_signature,
        isSigned: true,
      },
      onetimePrekey: bundle.one_time_prekey
        ? {
            id: 1,
            userId: bundle.user_id,
            deviceId: bundle.devices[0]?.device_id || 'default',
            keyId: 1,
            publicKey: bundle.one_time_prekey,
            isSigned: false,
          }
        : undefined,
      registrationId: 1,
    }
  },
}
