import api from './api';
import type { PreKeyBundle } from '@/types';

export interface RegisterRequest {
  email?: string;
  phone?: string;
  password: string;
  identityKey: string;
  deviceId: string;
  registrationId: number;
}

export interface LoginRequest {
  email?: string;
  phone?: string;
  password: string;
  deviceId: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  expiresAt: string;
}

export const authService = {
  async register(data: RegisterRequest): Promise<{ userId: string; message: string }> {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  async verify(code: string, email?: string, phone?: string): Promise<{ message: string }> {
    const response = await api.post('/auth/verify', { code, email, phone });
    return response.data;
  },

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post('/auth/login', data);
    return response.data;
  },

  async getIdentityKey(userId: string): Promise<{ userId: string; identityKey: string }> {
    const response = await api.get(`/keys/identity/${userId}`);
    return response.data;
  },

  async uploadPreKeys(deviceId: string, signedPreKey: any, oneTimePreKeys: any[]): Promise<void> {
    await api.post('/keys/prekeys', {
      deviceId,
      signedPreKey,
      oneTimePreKeys,
    });
  },

  async getPreKeyBundle(userId: string): Promise<PreKeyBundle> {
    const response = await api.get(`/keys/prekeys/${userId}`);
    return response.data;
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
    });
    return response.data;
  },

  async getMatchStatus(): Promise<any> {
    const response = await api.get('/match/status');
    return response.data;
  },

  async leaveMatchQueue(): Promise<void> {
    await api.delete('/match/queue');
  },
};
