// GSD Cloud -- Activity sidebar widget
// Collapsible panel (40px collapsed, 320px expanded) with SSE live event streaming
// Per D-07 (persists across navigation) and UI-SPEC (150ms ease-out translateX)

import { Activity, ChevronRight, AlertTriangle } from 'lucide-react';
import { useActivityContext } from '@/contexts/activity-context';
import { useActivityFeed } from '@/hooks/use-activity-feed';
import { ActivityEventItem } from './activity-event-item';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function ActivitySidebar() {
  const { isOpen, toggle, unreadCount } = useActivityContext();
  const { events, sseError } = useActivityFeed();
  const navigate = useNavigate();

  const handleEventClick = (event: { sessionId?: string; session_id?: string }) => {
    const sessionId = event.sessionId ?? event.session_id;
    if (sessionId) {
      navigate(`/sessions/${sessionId}`);
    }
  };

  return (
    <div className="relative flex-shrink-0">
      {/* Collapsed strip */}
      <div
        className={cn(
          'flex flex-col items-center justify-start pt-3 w-10 h-full border-l border-border bg-card cursor-pointer transition-opacity',
          isOpen && 'opacity-0 pointer-events-none absolute'
        )}
        onClick={toggle}
        role="button"
        aria-label="Open activity feed"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(); }}
      >
        <Activity className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="mt-1 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>

      {/* Expanded panel */}
      <div
        className={cn(
          'absolute top-0 right-0 h-full w-80 bg-card border-l border-border flex flex-col transition-transform duration-150 ease-out z-20',
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Activity</span>
            <span className="text-[10px] text-muted-foreground">
              {events.length} events
            </span>
          </div>
          <button
            onClick={toggle}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
            aria-label="Close activity feed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* SSE error warning */}
        {sseError && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-status-warning border-b border-border">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Live updates paused -- retrying
          </div>
        )}

        {/* Event list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 divide-y divide-border/50">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Activity className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Events from your sessions will appear here as they happen.
              </p>
            </div>
          ) : (
            events.map((event, index) => (
              <ActivityEventItem
                key={`${event.session_id ?? event.sessionId}-${event.sequence_number ?? index}`}
                event={event}
                onClick={handleEventClick}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
