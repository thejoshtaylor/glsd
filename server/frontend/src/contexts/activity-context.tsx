// GSD Cloud -- Activity sidebar state context
// Manages open/close state and unread badge count for the activity sidebar widget

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface ActivityContextValue {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  unreadCount: number;
  setUnreadCount: (count: number | ((prev: number) => number)) => void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      if (!prev) setUnreadCount(0); // Clear badge when opening
      return !prev;
    });
  }, []);
  const open = useCallback(() => { setIsOpen(true); setUnreadCount(0); }, []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <ActivityContext.Provider value={{ isOpen, toggle, open, close, unreadCount, setUnreadCount }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivityContext(): ActivityContextValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivityContext must be used within ActivityProvider');
  return ctx;
}
