// GSD Cloud -- Activity feed hook
// Combines React Query initial load with SSE live streaming from /api/v1/activity/stream

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActivityContext } from '@/contexts/activity-context';
import { apiRequest } from '@/lib/api/client';

const MAX_EVENTS = 100;

export interface ActivityEvent {
  event_type: string;
  sessionId?: string;
  session_id?: string;
  nodeId?: string;
  message?: string;
  created_at: string | null;
  payload?: Record<string, unknown>;
  sequence_number?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
}

export function useActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [sseError, setSseError] = useState(false);
  const failCountRef = useRef(0);
  const { isOpen, setUnreadCount } = useActivityContext();
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Initial load via React Query
  const { data: initialEvents } = useQuery<ActivityEvent[]>({
    queryKey: ['activity'],
    queryFn: () => apiRequest<ActivityEvent[]>('/activity?limit=50'),
  });

  // Seed events from initial load
  useEffect(() => {
    if (initialEvents && initialEvents.length > 0) {
      setEvents(initialEvents.slice(0, MAX_EVENTS));
    }
  }, [initialEvents]);

  // SSE live stream
  useEffect(() => {
    const source = new EventSource('/api/v1/activity/stream', {
      withCredentials: true,
    });

    source.onopen = () => {
      failCountRef.current = 0;
      setSseError(false);
    };

    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ActivityEvent;
        failCountRef.current = 0;
        setSseError(false);
        setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS));
        // Increment unread count if sidebar is closed
        if (!isOpenRef.current) {
          setUnreadCount((prev: number) => prev + 1);
        }
      } catch {
        // ignore malformed SSE data
      }
    };

    source.onerror = () => {
      failCountRef.current += 1;
      if (failCountRef.current >= 3) {
        setSseError(true);
      }
      // EventSource auto-reconnects; no manual handling needed
    };

    return () => source.close();
  }, [setUnreadCount]);

  return { events, sseError };
}
