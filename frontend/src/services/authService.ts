import api from './api'
import type { PreKeyBundle } from '../types'

export interface RegisterRequest {
  email?: string
  phone?: string
  password: string
}

export interface CompleteRegistrationRequest {
  tempToken: string
  identityKey: string
  deviceId: string
  registrationId: number
}

export interface LoginRequest {
  email?: string
  phone?: string
  password: string
}

export interface VerifyLoginRequest {
  email?: string
  phone?: string
  code: string
  deviceId: string
}

export interface LoginResponse {
  token: string
  userId: string
  expiresAt: string
}

export interface VerifyLoginResponse extends LoginResponse {
  deviceExists: boolean
  isNewDevice: boolean
  registeredDevices?: string[]
}

export const authService = {
  async register(data: RegisterRequest): Promise<{ userId: string; message: string }> {
    const response = await api.post('/auth/register', {
      email: data.email,
      phone: data.phone,
      password: data.password,
    })
    return response.data
  },

  async verify(code: string, email?: string, phone?: string): Promise<{ message: string; temp_token: string; user_id: string; expires_at: string }> {
    const response = await api.post('/auth/verify', { code, email, phone })
    return response.data
  },

  async completeRegistration(data: CompleteRegistrationRequest): Promise<LoginResponse> {
    const response = await api.post('/auth/complete-registration', {
      temp_token: data.tempToken,
      identity_key: data.identityKey,
      device_id: data.deviceId,
      registration_id: data.registrationId,
    })
    return response.data
  },

  async login(data: LoginRequest): Promise<{ message: string; user_id: string }> {
    const response = await api.post('/auth/login', {
      email: data.email,
      phone: data.phone,
      password: data.password,
    })
    return response.data
  },

  async verifyLogin(data: VerifyLoginRequest): Promise<VerifyLoginResponse> {
    const response = await api.post('/auth/verify-login', {
      email: data.email,
      phone: data.phone,
      code: data.code,
      device_id: data.deviceId,
    })
    return response.data
  },

  async getIdentityKey(userId: string): Promise<{ userId: string; identityKey: string }> {
    const response = await api.get(`/keys/identity/${userId}`)
    return response.data
  },

  async uploadPreKeys(deviceId: string, signedPreKey: any, oneTimePreKeys: any[]): Promise<void> {
    await api.post('/keys/prekeys', {
      device_id: deviceId,
      signed_prekey: signedPreKey,
      onetime_prekeys: oneTimePreKeys,
    })
  },

  async getPreKeyBundle(userId: string): Promise<PreKeyBundle> {
    const response = await api.get(`/keys/prekeys/${userId}`)
    return response.data
  },

  async joinMatchQueue(
    categoryTags: string[],
    ephemeralIdentityKey: string,
    ephemeralSignedPreKey: string
  ): Promise<{ queueId: string; anonymousId: string }> {
    const response = await api.post('/match/queue', {
      categoryTags,
      ephemeralIdentityKey,
      ephemeralSignedPreKey,
    })
    return response.data
  },

  async getMatchStatus(): Promise<any> {
    const response = await api.get('/match/status')
    return response.data
  },

  async leaveMatchQueue(): Promise<void> {
    await api.delete('/match/queue')
  },
}
