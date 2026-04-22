// VCCA - Quick Actions Bar (OV-02)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { RefreshCw, SquareTerminal, Sparkles, ListPlus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProjectSessions } from '@/lib/queries';

interface QuickActionsBarProps {
  onOpenShell: () => void;
  onSyncGsd?: () => void;
  isSyncingGsd?: boolean;
  hasPlanning?: boolean;
  projectId?: string;
  onNewMilestone?: () => void;
  onQueueMilestone?: () => void;
  onQuickTask?: () => void;
}

export function QuickActionsBar({
  onOpenShell,
  onSyncGsd,
  isSyncingGsd = false,
  hasPlanning = false,
  projectId,
  onNewMilestone,
  onQueueMilestone,
  onQuickTask,
}: QuickActionsBarProps) {
  const { data: sessionsData } = useProjectSessions(projectId ?? '');
  const sessions = sessionsData?.data ?? [];
  const hasActiveSessions = sessions.some(
    (s) => s.status === 'active' || s.status === 'running',
  );

  return (
    <div className="flex items-center gap-2 pb-4">
      {hasPlanning && onSyncGsd && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onSyncGsd}
              disabled={isSyncingGsd}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncingGsd ? 'animate-spin' : ''}`} />
              Sync GLSD
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-sync .planning/ files into the database</TooltipContent>
        </Tooltip>
      )}

      {projectId && !hasActiveSessions && onNewMilestone && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onNewMilestone}>
              <Sparkles className="h-4 w-4 mr-2" />
              New Milestone
            </Button>
          </TooltipTrigger>
          <TooltipContent>Start a new milestone</TooltipContent>
        </Tooltip>
      )}

      {projectId && hasActiveSessions && onQueueMilestone && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onQueueMilestone}>
              <ListPlus className="h-4 w-4 mr-2" />
              Queue Milestone
            </Button>
          </TooltipTrigger>
          <TooltipContent>Queue a milestone to run after the active session</TooltipContent>
        </Tooltip>
      )}

      {projectId && onQuickTask && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onQuickTask}>
              <Zap className="h-4 w-4 mr-2" />
              Quick Task
            </Button>
          </TooltipTrigger>
          <TooltipContent>Run a quick one-off task</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={onOpenShell}>
            <SquareTerminal className="h-4 w-4 mr-2" />
            Shell
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open interactive shell</TooltipContent>
      </Tooltip>
    </div>
  );
}
