// VCCA - Portfolio Page
// Cross-project portfolio analytics and health overview
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import {
  Briefcase,
  FolderOpen,
  Archive,
  AlertTriangle,
  DollarSign,
  Clock3,
  ArrowRight,
  Play,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { queryKeys } from '@/lib/query-keys';
import { useAllGsdTodos, useProjectsWithStats } from '@/lib/queries';
import type { Gsd2Health } from '@/lib/tauri';
import type { ProjectPublic } from '@/lib/api/projects';
import * as api from '@/lib/tauri';

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatLastSeen(isoDate: string | null | undefined): string {
  if (!isoDate) return 'No activity recorded';
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isStale(project: ProjectPublic): boolean {
  if (!project.created_at) return false;
  return Date.now() - new Date(project.created_at).getTime() > 3 * 24 * 60 * 60 * 1000;
}

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2 text-muted-foreground">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectListRow({
  project,
  detail,
  badge,
  onOpen,
}: {
  project: ProjectPublic;
  detail: string;
  badge?: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
    >
      <FolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{project.name}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {badge}
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </button>
  );
}

export function PortfolioPage() {
  const navigate = useNavigate();
  const { data: projects, isLoading } = useProjectsWithStats();
  const { data: todos } = useAllGsdTodos();

  // Cloud API returns slim ProjectPublic -- no status or gsd_version fields
  const activeProjects = useMemo(
    () => (projects ?? []),
    [projects]
  );
  const archivedProjects = useMemo(
    () => [] as ProjectPublic[],
    []
  );
  const gsd2Projects = useMemo(
    () => [] as ProjectPublic[],
    []
  );

  const healthQueries = useQueries({
    queries: gsd2Projects.map((project) => ({
      queryKey: queryKeys.gsd2Health(project.id),
      queryFn: () => api.gsd2GetHealth(project.id),
      staleTime: 5_000,
      refetchInterval: 10_000,
    })),
  });

  const blockedProjectIds = useMemo(() => {
    const ids = new Set<string>();
    (todos ?? []).forEach((todo) => {
      if (todo.is_blocker && todo.status !== 'done') ids.add(todo.project_id);
    });
    gsd2Projects.forEach((project, index) => {
      if (healthQueries[index]?.data?.blocker) ids.add(project.id);
    });
    return ids;
  }, [todos, gsd2Projects, healthQueries]);

  const staleProjects = useMemo(
    () => activeProjects.filter(isStale).sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    }),
    [activeProjects]
  );

  // Cloud API has no total_cost field
  const totalCost = 0;

  const expensiveProjects = useMemo(
    () => [...activeProjects].slice(0, 6),
    [activeProjects]
  );

  const activeRuns = useMemo(
    () =>
      gsd2Projects
        .map((project, index) => ({ project, health: healthQueries[index]?.data }))
        .filter(
          (
            item
          ): item is { project: ProjectPublic; health: Gsd2Health } =>
            Boolean(
              item.health &&
                (item.health.phase === 'running' ||
                  item.health.phase === 'executing' ||
                  item.health.active_task_id ||
                  item.health.active_slice_id)
            )
        )
        .slice(0, 6),
    [gsd2Projects, healthQueries]
  );

  const recentlyTouched = useMemo(
    () =>
      [...activeProjects]
        .sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 6),
    [activeProjects]
  );

  return (
    <div className="h-full overflow-auto p-8">
      <PageHeader
        title="Portfolio"
        description="See the workspace as a portfolio: health, spend, active runs, and idle work."
        icon={<Briefcase className="h-6 w-6 text-muted-foreground" />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Active Projects"
          value={activeProjects.length}
          description="Projects currently in the working set"
          icon={<FolderOpen className="h-4 w-4" />}
        />
        <MetricCard
          title="Archived"
          value={archivedProjects.length}
          description="Projects moved out of the active queue"
          icon={<Archive className="h-4 w-4" />}
        />
        <MetricCard
          title="Blocked"
          value={blockedProjectIds.size}
          description="Projects with explicit blockers or health blockers"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <MetricCard
          title="Total Spend"
          value={formatCurrency(totalCost)}
          description="Aggregate cost tracked across all projects"
          icon={<DollarSign className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Expensive Projects</CardTitle>
            <CardDescription>Use this to find high-cost work that may need review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading portfolio cost data…</p>
            ) : expensiveProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active projects yet.</p>
            ) : (
              expensiveProjects.map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  detail={`Created ${formatLastSeen(project.created_at)}`}
                  onOpen={() => void navigate(`/projects/${project.id}`)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Runs</CardTitle>
            <CardDescription>Projects that appear to be executing right now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading active run data…</p>
            ) : activeRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No running GSD-2 projects detected.</p>
            ) : (
              activeRuns.map(({ project, health }) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  detail={`${health?.active_task_title ?? health?.active_slice_title ?? health?.next_action ?? 'Run in progress'} · ${health?.tasks_done}/${health?.tasks_total} tasks`}
                  badge={
                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">
                      <Play className="mr-1 h-3 w-3" />
                      {health?.phase ?? 'running'}
                    </Badge>
                  }
                  onOpen={() => void navigate(`/projects/${project.id}`)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stale Projects</CardTitle>
            <CardDescription>Projects untouched for more than 3 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading stale projects…</p>
            ) : staleProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing looks stale right now.</p>
            ) : (
              staleProjects.slice(0, 6).map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  detail={`Created ${formatLastSeen(project.created_at)}`}
                  badge={
                    <Badge variant="outline">
                      <Clock3 className="mr-1 h-3 w-3" />
                      stale
                    </Badge>
                  }
                  onOpen={() => void navigate(`/projects/${project.id}`)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Active</CardTitle>
            <CardDescription>The most recently touched projects in the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading recent activity…</p>
            ) : recentlyTouched.length === 0 ? (
              <p className="text-sm text-muted-foreground">No project activity yet.</p>
            ) : (
              recentlyTouched.map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  detail={`Created ${formatLastSeen(project.created_at)}`}
                  badge={blockedProjectIds.has(project.id) ? <Badge variant="destructive">blocked</Badge> : undefined}
                  onOpen={() => void navigate(`/projects/${project.id}`)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
