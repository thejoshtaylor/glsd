// GSD Cloud -- Activity event item component
// Renders a single activity event row with icon, message, and relative timestamp
// D-08: taskComplete items display inline cost breakdown

import { cn, formatRelativeTime } from '@/lib/utils';
import { formatCost, formatDuration } from '@/lib/format';
import {
  Send, CheckCircle2, AlertTriangle, ShieldQuestion,
  MessageCircleQuestion, Play, Square, Zap,
} from 'lucide-react';
import type { ActivityEvent } from '@/hooks/use-activity-feed';

const eventTypeIcons: Record<string, typeof Zap> = {
  task: Send,
  task_sent: Send,
  taskComplete: CheckCircle2,
  taskError: AlertTriangle,
  permissionRequest: ShieldQuestion,
  question: MessageCircleQuestion,
  session_created: Play,
  session_stopped: Square,
};

const eventTypeColors: Record<string, string> = {
  task: 'text-gsd-cyan',
  task_sent: 'text-gsd-cyan',
  taskComplete: 'text-status-success',
  taskError: 'text-status-error',
  permissionRequest: 'text-status-warning',
  question: 'text-status-info',
  session_created: 'text-gsd-cyan',
  session_stopped: 'text-muted-foreground',
};

interface ActivityEventItemProps {
  event: ActivityEvent;
  onClick?: (event: ActivityEvent) => void;
}

function getTaskCompleteDetail(event: ActivityEvent): string | null {
  // Cost fields may arrive as top-level (SSE broadcast) or in payload (REST load)
  const src = event as unknown as Record<string, unknown>;
  const payload = (src.payload ?? {}) as Record<string, unknown>;
  const inputTokens = (src.input_tokens ?? payload.input_tokens) as number | undefined;
  const outputTokens = (src.output_tokens ?? payload.output_tokens) as number | undefined;
  const costUsd = (src.cost_usd ?? payload.cost_usd) as number | undefined;
  const durationMs = (src.duration_ms ?? payload.duration_ms) as number | undefined;

  if (inputTokens == null && costUsd == null) return null;

  const parts: string[] = [];
  if (inputTokens != null && outputTokens != null) {
    parts.push(`in:${inputTokens} out:${outputTokens}`);
  }
  if (costUsd != null) parts.push(formatCost(costUsd));
  if (durationMs != null) parts.push(formatDuration(durationMs));

  return parts.length > 0 ? parts.join(' \u00b7 ') : null;
}

export function ActivityEventItem({ event, onClick }: ActivityEventItemProps) {
  const Icon = eventTypeIcons[event.event_type] ?? Zap;
  const colorClass = eventTypeColors[event.event_type] ?? 'text-muted-foreground';
  const message = event.message ?? event.event_type.replace(/_/g, ' ');
  const detail = event.event_type === 'taskComplete' ? getTaskCompleteDetail(event) : null;

  return (
    <button
      type="button"
      className="flex items-start gap-2 py-1.5 w-full text-left hover:bg-muted/50 rounded px-1 transition-colors"
      onClick={() => onClick?.(event)}
    >
      <div className={cn('mt-0.5 shrink-0', colorClass)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug truncate">{message}</p>
        {detail && (
          <p className="text-xs text-muted-foreground font-mono truncate">{detail}</p>
        )}
        <span className="text-[10px] text-muted-foreground">
          {event.created_at ? formatRelativeTime(event.created_at) : ''}
        </span>
      </div>
    </button>
  );
}
