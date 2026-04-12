// GSD Cloud -- Session detail / redirect page
// Completed sessions: show cost breakdown (input_tokens, output_tokens, cost_usd, duration_ms)
// Active sessions: redirect to terminal launcher at /nodes/:nodeId/session
// Error sessions: show error state with session info

import { useParams, Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '@/lib/api/sessions';
import { getSessionUsage } from '@/lib/api/usage';
import { formatCost, formatDuration, formatTokenCount } from '@/lib/format';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, AlertCircle, ArrowLeft, Clock, DollarSign, Cpu, Timer } from 'lucide-react';

function formatTimestamp(ts: string | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: session, isLoading, error } = useQuery({
    queryKey: ['session', id],
    queryFn: () => getSession(id!),
    enabled: !!id,
    retry: false,
  });

  const isCompleted = session?.status === 'completed';

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['session-usage', id],
    queryFn: () => getSessionUsage(id!),
    enabled: !!id && isCompleted,
    retry: false,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error fetching session
  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Session not found'}
        </p>
        <Link to="/usage" className="text-sm text-muted-foreground hover:underline">
          Back to Usage
        </Link>
      </div>
    );
  }

  // Active sessions: redirect to terminal
  if (session.status === 'running' || session.status === 'created' || session.status === 'pending') {
    return <Navigate to={`/nodes/${session.node_id}/session`} replace />;
  }

  // Completed or error sessions: render detail page
  const isError = session.status === 'error';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/usage"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Usage
        </Link>
        <h1 className="text-xl font-semibold">Session Detail</h1>
      </div>

      {/* Session info card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Session {id?.slice(0, 8)}...
            </CardTitle>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isError
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              }`}
            >
              {session.status}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {session.cwd && (
            <div className="text-sm">
              <span className="text-muted-foreground">Working directory:</span>{' '}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{session.cwd}</code>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Created:</span>{' '}
              {formatTimestamp(session.created_at)}
            </div>
            <div>
              <span className="text-muted-foreground">Started:</span>{' '}
              {formatTimestamp(session.started_at)}
            </div>
            <div>
              <span className="text-muted-foreground">Completed:</span>{' '}
              {formatTimestamp(session.completed_at)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost breakdown card -- only for completed sessions */}
      {isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {usageLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : usage ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex items-start gap-2">
                  <Cpu className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Input Tokens</p>
                    <p className="text-lg font-semibold">{formatTokenCount(usage.input_tokens)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Cpu className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Output Tokens</p>
                    <p className="text-lg font-semibold">{formatTokenCount(usage.output_tokens)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Cost</p>
                    <p className="text-lg font-semibold">{formatCost(usage.cost_usd)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Timer className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="text-lg font-semibold">{formatDuration(usage.duration_ms)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <p>No usage data recorded for this session</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
