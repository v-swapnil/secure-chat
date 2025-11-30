import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/config';

export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
};

export const setAuthToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  } catch (error) {
    console.error('Failed to set auth token:', error);
  }
};

export const getUserId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.USER_ID);
  } catch (error) {
    console.error('Failed to get user ID:', error);
    return null;
  }
};

export const setUserId = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ID, userId);
  } catch (error) {
    console.error('Failed to set user ID:', error);
  }
};

export const getDeviceId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  } catch (error) {
    console.error('Failed to get device ID:', error);
    return null;
  }
};

export const setDeviceId = async (deviceId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  } catch (error) {
    console.error('Failed to set device ID:', error);
  }
};

export const clearAuthData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.USER_ID,
      STORAGE_KEYS.DEVICE_ID,
      STORAGE_KEYS.IDENTITY_KEY,
    ]);
  } catch (error) {
    console.error('Failed to clear auth data:', error);
  }
};
