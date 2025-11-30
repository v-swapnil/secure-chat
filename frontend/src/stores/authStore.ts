import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AuthState {
  isAuthenticated: boolean
  userId: string | null
  token: string | null
  identityKey: string | null
  deviceId: string | null
  login: (userId: string, token: string, identityKey: string, deviceId: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      userId: null,
      token: null,
      identityKey: null,
      deviceId: null,
      login: (userId, token, identityKey, deviceId) => {
        localStorage.setItem('auth_token', token)
        set({ isAuthenticated: true, userId, token, identityKey, deviceId })
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ isAuthenticated: false, userId: null, token: null, identityKey: null, deviceId: null })
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
