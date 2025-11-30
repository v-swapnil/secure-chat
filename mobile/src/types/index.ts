export interface User {
  id: string;
  email?: string;
  phone?: string;
  identityKey: string;
}

export interface Device {
  id: string;
  userId: string;
  deviceId: string;
  registrationId: number;
}

export interface PreKey {
  id: number;
  userId: string;
  deviceId: string;
  keyId: number;
  publicKey: string;
  signature?: string;
  isSigned: boolean;
}

export interface PreKeyBundle {
  userId: string;
  deviceId: string;
  identityKey: string;
  signedPrekey: PreKey;
  onetimePrekey?: PreKey;
  registrationId: number;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system';
  delivered?: boolean;
  read?: boolean;
}

export interface EncryptedMessage {
  from: string;
  to: string;
  type: string;
  payload: {
    ciphertext: string;
    registrationId?: number;
    preKeyId?: number;
  };
}

export interface ChatSession {
  partnerId: string;
  partnerIdentityKey: string;
  isAnonymous: boolean;
  messages: Message[];
  safetyNumber?: string;
}

export interface QuestionnaireAnswer {
  question: string;
  answer: string;
}

export interface MatchQueueEntry {
  anonymousId: string;
  categoryTags: string[];
  ephemeralIdentityKey: string;
  ephemeralSignedPreKey: string;
}

export interface MatchStatus {
  matched: boolean;
  matchId?: string;
  partnerAnonymousId?: string;
  partnerEphemeralKey?: string;
  partnerSignedPreKey?: string;
}

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface StoredSession {
  partnerId: string;
  sessionData: string; // Encrypted session state
  createdAt: number;
  lastUsed: number;
}
