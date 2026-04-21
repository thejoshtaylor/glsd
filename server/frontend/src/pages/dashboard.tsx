// GLSD - Dashboard Page
// Project grid adapted for slim ProjectPublic model from cloud API

import { useState, useMemo } from 'react';
import {
  Plus,
  FolderOpen,
  LayoutDashboard,
  Search,
  X,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useProjectsWithStats, useSettings } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectWizardDialog, GuidedProjectWizard } from '@/components/projects';
import { StatusBar, ProjectCard, ProjectRow } from '@/components/dashboard';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';

export function Dashboard() {
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const { data: projects, isLoading } = useProjectsWithStats();
  const { data: settings } = useSettings();
  const userMode = settings?.user_mode ?? 'expert';

  // Sort by created_at descending
  const sortedProjects = useMemo(() => {
    if (!projects?.length) return [];
    return [...projects].sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });
  }, [projects]);

  // Filter by search query (name)
  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedProjects;
    return sortedProjects.filter((p) => p.name.toLowerCase().includes(q));
  }, [sortedProjects, search]);

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-8 pt-6 pb-4">
        <PageHeader
          title="Projects"
          description="Manage and monitor your projects"
          icon={<LayoutDashboard className="h-6 w-6 text-muted-foreground" />}
          actions={
            <Button onClick={() => setAddProjectOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
          }
        />
      </div>

      {/* Stats Bar */}
      <div className="px-8 pb-4">
        <StatusBar />
      </div>

      {/* Toolbar: search + view toggle */}
      <div className="px-8 pb-3 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Count label */}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filteredProjects.length}
          {search ? ` / ${projects?.length ?? 0}` : ''}{' '}
          {filteredProjects.length === 1 ? 'project' : 'projects'}
        </span>

        {/* View toggle -- pushed to right */}
        <div className="flex items-center border rounded-md ml-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 rounded-l-md transition-colors',
              viewMode === 'grid'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded-r-md transition-colors',
              viewMode === 'list'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-auto px-8 pt-2 pb-4">
        {isLoading ? (
          <SkeletonGrid />
        ) : !projects?.length ? (
          <EmptyState onAdd={() => setAddProjectOpen(true)} />
        ) : (
          <>
            {/* Empty search state */}
            {filteredProjects.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No projects match "{search}"
                </p>
              </div>
            )}

            {/* Grid view */}
            {viewMode === 'grid' && filteredProjects.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProjects.map((project, index) => (
                  <div
                    key={project.id}
                    className="animate-stagger-in"
                    style={{ animationDelay: `${Math.min(index * 50, 1000)}ms` }}
                  >
                    <ProjectCard
                      project={project}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* List view */}
            {viewMode === 'list' && filteredProjects.length > 0 && (
              <div className="flex flex-col gap-1">
                {filteredProjects.map((project, index) => (
                  <div
                    key={project.id}
                    className="animate-stagger-in"
                    style={{ animationDelay: `${Math.min(index * 50, 1000)}ms` }}
                  >
                    <ProjectRow
                      project={project}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {userMode === 'guided' ? (
        <GuidedProjectWizard
          open={addProjectOpen}
          onOpenChange={setAddProjectOpen}
        />
      ) : (
        <ProjectWizardDialog
          open={addProjectOpen}
          onOpenChange={setAddProjectOpen}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[400px]">
      <div className="text-center py-16">
        <div className="p-4 rounded-full bg-muted w-fit mx-auto mb-4">
          <FolderOpen className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No projects yet</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Add one to get started
        </p>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Project
        </Button>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border bg-card/30 p-4 space-y-3 animate-pulse"
        >
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-muted/50 rounded" />
            <div className="h-4 flex-1 bg-muted/50 rounded" />
            <div className="h-4 w-10 bg-muted/50 rounded" />
          </div>
          <div className="h-3 w-3/4 bg-muted/50 rounded" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 bg-muted/50 rounded" />
            <div className="h-5 w-12 bg-muted/50 rounded" />
          </div>
          <div className="flex-1 h-1.5 bg-muted/50 rounded-full" />
          <div className="flex items-center gap-3">
            <div className="h-3 w-20 bg-muted/50 rounded" />
            <div className="h-3 w-16 bg-muted/50 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
