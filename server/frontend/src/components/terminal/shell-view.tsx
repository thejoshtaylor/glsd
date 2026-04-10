// GSD Cloud — Shell View
// Wraps TerminalTabs with node selection for cloud session creation

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TerminalTabs } from '@/components/terminal';
import { NodeSelector } from '@/components/nodes/node-selector';
import { Input } from '@/components/ui/input';

interface ShellViewProps {
  projectId: string;
  projectPath: string;
  className?: string;
}

export function ShellView({ projectId, projectPath, className }: ShellViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [cwd, setCwd] = useState(projectPath);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Node + cwd selection bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 flex-shrink-0">
        <div className="w-48 flex-shrink-0">
          <NodeSelector
            value={selectedNodeId}
            onChange={setSelectedNodeId}
          />
        </div>
        <Input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="Working directory (e.g. /home/user/project)"
          className="flex-1 text-sm h-9 bg-background"
        />
      </div>

      <TerminalTabs
        projectId={projectId}
        workingDirectory={cwd || projectPath}
        className="flex-1 min-h-0"
      />
    </div>
  );
}
