// GSD Cloud — Session redirect page
// Fetches session by ID, extracts node_id, redirects to /nodes/:nodeId/session
// Per D-03: thin redirect, not a real session detail page
// Per D-05: uses Navigate replace so back button goes to activity, not here

import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '@/lib/api/sessions';
import { Loader2, AlertCircle } from 'lucide-react';

export function SessionRedirectPage() {
  const { id } = useParams<{ id: string }>();

  const { data: session, isLoading, error } = useQuery({
    queryKey: ['session', id],
    queryFn: () => getSession(id!),
    enabled: !!id,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Session not found'}
        </p>
      </div>
    );
  }

  return <Navigate to={`/nodes/${session.node_id}/session`} replace />;
}
