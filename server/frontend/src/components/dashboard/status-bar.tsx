// GLSD - Dashboard Status Bar
// Slim summary for cloud projects: project count only (rich stats unavailable in cloud API)

import { FolderOpen } from 'lucide-react';
import { useProjectsWithStats } from '@/lib/queries';

export function StatusBar() {
  const { data: projects } = useProjectsWithStats();

  const projectCount = projects?.length ?? 0;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-card/50 text-sm">
      <StatItem
        icon={<FolderOpen className="h-3.5 w-3.5" />}
        value={projectCount}
        label={projectCount === 1 ? 'project' : 'projects'}
      />
    </div>
  );
}

function StatItem({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}
