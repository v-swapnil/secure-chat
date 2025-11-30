// API configuration
export const API_URL = __DEV__
  ? 'http://localhost:8080'
  : 'https://api.yourdomain.com';

export const WS_URL = __DEV__
  ? 'ws://localhost:8080'
  : 'wss://api.yourdomain.com';

// Push notification configuration
export const FCM_SENDER_ID = 'your-fcm-sender-id';

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: '@secure_chat:auth_token',
  USER_ID: '@secure_chat:user_id',
  DEVICE_ID: '@secure_chat:device_id',
  IDENTITY_KEY: '@secure_chat:identity_key',
};

// Keychain service name for secure storage
export const KEYCHAIN_SERVICE = 'com.securechat.keys';
