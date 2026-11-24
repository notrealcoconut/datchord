import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import type { DmConversation, RealtimeEvent } from '../types';

export type RealtimeStatus = 'connecting' | 'open' | 'closed';

interface RealtimeContextValue {
  status: RealtimeStatus;
  conversations: DmConversation[];
  unreadTotal: number;
  refreshConversations: () => Promise<void>;
  subscribe: (listener: (event: RealtimeEvent) => void) => () => void;
  openDirect: (userId: string) => Promise<DmConversation>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const listenersRef = useRef(new Set<(event: RealtimeEvent) => void>());
  const inFlightRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const emit = useCallback((event: RealtimeEvent) => {
    for (const listener of [...listenersRef.current]) {
      try {
        listener(event);
      } catch {
        /* A broken listener must not stop the others. */
      }
    }
  }, []);

  const subscribe = useCallback((listener: (event: RealtimeEvent) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!userRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await api.dms.list();
      setConversations(result.conversations);
    } catch {
      /* The DM list is best-effort; the page keeps its last snapshot. */
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setStatus('closed');
      return;
    }
    void refreshConversations();
    const source = new EventSource('/api/events');
    setStatus('connecting');
    source.onopen = () => setStatus('open');
    source.onmessage = (message) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(message.data) as RealtimeEvent;
      } catch {
        return;
      }
      setStatus('open');
      if (
        event.type === 'dm-conversation' ||
        event.type === 'dm-message' ||
        event.type === 'dm-removed'
      ) {
        void refreshConversations();
      }
      emit(event);
    };
    source.onerror = () => {
      setStatus(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting');
    };
    return () => {
      source.close();
      setStatus('closed');
    };
  }, [user, emit, refreshConversations]);

  const openDirect = useCallback(
    async (userId: string) => {
      const result = await api.dms.create({ userIds: [userId] });
      await refreshConversations();
      return result.conversation;
    },
    [refreshConversations],
  );

  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      conversations,
      unreadTotal,
      refreshConversations,
      subscribe,
      openDirect,
    }),
    [status, conversations, unreadTotal, refreshConversations, subscribe, openDirect],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside RealtimeProvider');
  return context;
}
