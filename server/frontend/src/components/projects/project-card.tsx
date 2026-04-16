// GLSD - Project Card (list item)
// Slim card rendering ProjectPublic model from cloud API

import { Link } from 'react-router-dom';
import {
  Clock,
  Server,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, truncatePath } from '@/lib/utils';
import type { ProjectPublic } from '@/lib/api/projects';

interface ProjectCardProps {
  project: ProjectPublic;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
    >
      {/* Row 1: Name */}
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold truncate flex-1">
          {project.name}
        </h3>

        {/* Node badge */}
        <Badge variant="secondary" size="sm" className="shrink-0">
          <Server className="h-3 w-3 mr-1" />
          {project.node_id.slice(0, 8)}
        </Badge>
      </div>

      {/* Row 2: Working directory */}
      <p className="text-sm text-muted-foreground truncate mt-1">
        {truncatePath(project.cwd)}
      </p>

      {/* Row 3: Created at */}
      {project.created_at && (
        <div className="flex items-center gap-1 mt-2">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(project.created_at)}
          </span>
        </div>
      )}
    </Link>
  );
}
