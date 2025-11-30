import { create } from 'zustand';
import type { ChatSession, Message } from '@/types';

interface ChatState {
  sessions: Map<string, ChatSession>;
  currentSessionId: string | null;
  addMessage: (sessionId: string, message: Message) => void;
  setCurrentSession: (sessionId: string) => void;
  createSession: (partnerId: string, partnerIdentityKey: string, isAnonymous: boolean) => void;
  clearSession: (sessionId: string) => void;
  updateMessageStatus: (sessionId: string, messageId: string, delivered?: boolean, read?: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: new Map(),
  currentSessionId: null,

  addMessage: (sessionId, message) => {
    set(state => {
      const session = state.sessions.get(sessionId);
      if (session) {
        session.messages.push(message);
        return { sessions: new Map(state.sessions) };
      }
      return state;
    });
  },

  setCurrentSession: sessionId => set({ currentSessionId: sessionId }),

  createSession: (partnerId, partnerIdentityKey, isAnonymous) => {
    set(state => {
      const sessions = new Map(state.sessions);
      sessions.set(partnerId, {
        partnerId,
        partnerIdentityKey,
        isAnonymous,
        messages: [],
      });
      return { sessions, currentSessionId: partnerId };
    });
  },

  clearSession: sessionId => {
    set(state => {
      const sessions = new Map(state.sessions);
      sessions.delete(sessionId);
      return { sessions };
    });
  },

  updateMessageStatus: (sessionId, messageId, delivered, read) => {
    set(state => {
      const session = state.sessions.get(sessionId);
      if (session) {
        const message = session.messages.find(m => m.id === messageId);
        if (message) {
          if (delivered !== undefined) message.delivered = delivered;
          if (read !== undefined) message.read = read;
        }
        return { sessions: new Map(state.sessions) };
      }
      return state;
    });
  },
}));
