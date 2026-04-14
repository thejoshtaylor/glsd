// GSD Cloud - Project Row (dashboard list item)
// Slim row rendering ProjectPublic model from cloud API

import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Server } from 'lucide-react';
import { formatRelativeTime, truncatePath } from '@/lib/utils';
import type { ProjectPublic } from '@/lib/api/projects';
import { Badge } from '@/components/ui/badge';

interface ProjectRowProps {
  project: ProjectPublic;
}

export const ProjectRow = React.memo(function ProjectRow({
  project,
}: ProjectRowProps) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card/50 hover:bg-card/80 hover:border-border/80 transition-colors group"
    >
      {/* Name */}
      <div className="flex items-center gap-2 min-w-0 w-[200px] shrink-0">
        <span className="font-medium text-sm text-foreground truncate">
          {project.name}
        </span>
      </div>

      {/* Node badge */}
      <Badge variant="secondary" size="sm" className="shrink-0">
        <Server className="h-3 w-3 mr-1" />
        {project.node_id.slice(0, 8)}
      </Badge>

      {/* Working directory */}
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
        {truncatePath(project.cwd)}
      </span>

      {/* Created at */}
      <div className="ml-auto shrink-0">
        {project.created_at && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <Clock className="h-3 w-3 shrink-0" />
            {formatRelativeTime(project.created_at)}
          </span>
        )}
      </div>
    </Link>
  );
});
