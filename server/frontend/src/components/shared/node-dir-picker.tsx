import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { browseNodeFs } from '@/lib/api/nodes';
import type { FsEntry } from '@/lib/api/nodes';

export interface NodeDirPickerProps {
  nodeId: string;
  onSelect: (path: string) => void;
  selectedPath: string;
}

export default function NodeDirPicker({ nodeId, onSelect, selectedPath }: NodeDirPickerProps) {
  const [currentPath, setCurrentPath] = useState('/');

  const { data, isLoading, error } = useQuery({
    queryKey: ['nodefs', nodeId, currentPath],
    queryFn: () => browseNodeFs(nodeId, currentPath),
    staleTime: 5000,
  });

  const segments = currentPath.split('/').filter(Boolean);

  function navigateTo(idx: number) {
    const newPath = idx < 0 ? '/' : '/' + segments.slice(0, idx + 1).join('/');
    setCurrentPath(newPath);
  }

  const dirs: FsEntry[] = data?.entries.filter((e) => e.isDirectory) ?? [];

  return (
    <div className="flex flex-col gap-2">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => navigateTo(-1)}>
          /
        </button>
        {segments.map((seg, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <span>/</span>
            <button className="hover:text-foreground" onClick={() => navigateTo(idx)}>
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Directory listing */}
      <div className="max-h-40 overflow-y-auto rounded border text-sm">
        {isLoading && <p className="p-2 text-muted-foreground">Loading…</p>}
        {error && <p className="p-2 text-destructive">Error loading directory</p>}
        {!isLoading && !error && dirs.length === 0 && (
          <p className="p-2 text-muted-foreground">No subdirectories</p>
        )}
        {dirs.map((entry) => (
          <button
            key={entry.path}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
            onClick={() => setCurrentPath(entry.path)}
          >
            <span>📁</span>
            <span>{entry.name}</span>
          </button>
        ))}
      </div>

      {/* Select this folder */}
      <Button size="sm" variant="secondary" onClick={() => onSelect(currentPath)}>
        Select this folder
        {selectedPath === currentPath && ' ✓'}
      </Button>
    </div>
  );
}
