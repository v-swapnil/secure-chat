import { create } from 'zustand';
import { setAuthToken, setUserId, setDeviceId, clearAuthData } from '@/utils/storage';

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  identityKey: string | null;
  deviceId: string | null;
  login: (userId: string, token: string, identityKey: string, deviceId: string) => Promise<void>;
  logout: () => Promise<void>;
  setIdentityKey: (key: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  userId: null,
  token: null,
  identityKey: null,
  deviceId: null,

  login: async (userId, token, identityKey, deviceId) => {
    await setAuthToken(token);
    await setUserId(userId);
    await setDeviceId(deviceId);
    set({ isAuthenticated: true, userId, token, identityKey, deviceId });
  },

  logout: async () => {
    await clearAuthData();
    set({
      isAuthenticated: false,
      userId: null,
      token: null,
      identityKey: null,
      deviceId: null,
    });
  },

  setIdentityKey: (key: string) => {
    set({ identityKey: key });
  },
}));
