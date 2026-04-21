// GLSD - Project Card (dashboard grid item)
// Slim card rendering ProjectPublic model from cloud API

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { ProjectPublic } from '@/lib/api/projects';
import { Card, CardContent } from '@/components/ui/card';

// Fixed card height so every card is identical regardless of content
const CARD_HEIGHT = 240;

interface ProjectCardProps {
  project: ProjectPublic;
}

export const ProjectCard = React.memo(function ProjectCard({
  project,
}: ProjectCardProps) {
  return (
    <Link to={`/projects/${project.id}`} className="block">
      <Card
        className="flex flex-col overflow-hidden hover:bg-muted/50 transition-colors"
        style={{ height: CARD_HEIGHT }}
      >
        {/* Header: name */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-0">
          <h3 className="font-semibold text-foreground truncate flex-1 text-sm">
            {project.name}
          </h3>
        </div>

        {/* Body */}
        <CardContent className="px-4 pt-2 pb-0 flex-1 flex flex-col gap-2 overflow-hidden" />

        {/* Footer: created_at -- pinned to bottom */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground px-4 pb-3 pt-2 mt-auto">
          {project.created_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {formatRelativeTime(project.created_at)}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
});
