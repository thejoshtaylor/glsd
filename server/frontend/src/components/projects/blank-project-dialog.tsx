import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useNodes } from '../../lib/queries';
import { createProject, createProjectGitConfig, addProjectNode } from '../../lib/api/projects';
import { browseNodeFs } from '../../lib/api/nodes';
import type { FsEntry } from '../../lib/api/nodes';

// ── NodeDirPicker ──────────────────────────────────────────────────────────

interface NodeDirPickerProps {
  nodeId: string;
  onSelect: (path: string) => void;
  selectedPath: string;
}

function NodeDirPicker({ nodeId, onSelect, selectedPath }: NodeDirPickerProps) {
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

// ── BlankProjectDialog ─────────────────────────────────────────────────────

export interface BlankProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'entry' | 'name' | 'git-config' | 'node-dir';

interface GitConfig {
  repoUrl: string;
  pullFromBranch: string;
  pushToBranch: string;
  mergeMode: 'auto_pr' | 'auto_push';
  prTargetBranch: string;
}

export function BlankProjectDialog({ open, onOpenChange }: BlankProjectDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: nodesData } = useNodes();
  const nodes = nodesData?.data ?? [];

  const [step, setStep] = useState<Step>('entry');
  const [name, setName] = useState('');
  const [gitConfig, setGitConfig] = useState<GitConfig>({
    repoUrl: '',
    pullFromBranch: 'main',
    pushToBranch: 'main',
    mergeMode: 'auto_pr',
    prTargetBranch: '',
  });
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep('entry');
    setName('');
    setGitConfig({ repoUrl: '', pullFromBranch: 'main', pushToBranch: 'main', mergeMode: 'auto_pr', prTargetBranch: '' });
    setSelectedNodeId('');
    setSelectedPath('');
    setError(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function onCreate(skipNode = false) {
    setIsLoading(true);
    setError(null);
    try {
      const project = await createProject({ name: name.trim(), cwd: '.' });

      if (gitConfig.repoUrl.trim()) {
        try {
          await createProjectGitConfig(project.id, {
            repo_url: gitConfig.repoUrl.trim(),
            pull_from_branch: gitConfig.pullFromBranch || 'main',
            push_to_branch: gitConfig.pushToBranch || 'main',
            merge_mode: gitConfig.mergeMode,
            pr_target_branch: gitConfig.mergeMode === 'auto_pr' && gitConfig.prTargetBranch ? gitConfig.prTargetBranch : null,
          });
        } catch (e: unknown) {
          // Ignore 409 — should not happen for a new project
          if (!(e instanceof Error && e.message.includes('409'))) throw e;
        }
      }

      if (!skipNode && selectedNodeId && selectedPath) {
        await addProjectNode(project.id, { node_id: selectedNodeId, local_path: selectedPath, is_primary: true });
      }

      await queryClient.invalidateQueries({ queryKey: ['server-projects'] });
      handleOpenChange(false);
      navigate(`/projects/${project.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* ── Entry ── */}
        {step === 'entry' && (
          <>
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              {/* Blank / Existing card */}
              <button
                className="flex flex-col gap-2 rounded-lg border p-4 text-left hover:border-primary hover:bg-muted transition-colors"
                onClick={() => setStep('name')}
              >
                <span className="font-semibold">Blank / Existing</span>
                <span className="text-sm text-muted-foreground">
                  Create a project from an existing codebase or start blank.
                </span>
              </button>

              {/* Smart Start card — disabled placeholder */}
              <div className="relative flex flex-col gap-2 rounded-lg border p-4 text-left opacity-50 pointer-events-none">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Smart Start</span>
                  <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  AI-guided project scaffolding.
                </span>
              </div>
            </div>
          </>
        )}

        {/* ── Name ── */}
        {step === 'name' && (
          <>
            <DialogHeader>
              <DialogTitle>Project Name</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                autoFocus
                placeholder="My project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setStep('git-config'); }}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button disabled={!name.trim()} onClick={() => setStep('git-config')}>Next →</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Git Config ── */}
        {step === 'git-config' && (
          <>
            <DialogHeader>
              <DialogTitle>GitHub Config (optional)</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <Input
                placeholder="Repository URL"
                value={gitConfig.repoUrl}
                onChange={(e) => setGitConfig((g) => ({ ...g, repoUrl: e.target.value }))}
              />
              <Input
                placeholder="Pull from branch"
                value={gitConfig.pullFromBranch}
                onChange={(e) => setGitConfig((g) => ({ ...g, pullFromBranch: e.target.value }))}
              />
              <Input
                placeholder="Push to branch"
                value={gitConfig.pushToBranch}
                onChange={(e) => setGitConfig((g) => ({ ...g, pushToBranch: e.target.value }))}
              />
              <Select
                value={gitConfig.mergeMode}
                onValueChange={(v) => setGitConfig((g) => ({ ...g, mergeMode: v as 'auto_pr' | 'auto_push' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Merge mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_pr">Auto PR</SelectItem>
                  <SelectItem value="auto_push">Auto push</SelectItem>
                </SelectContent>
              </Select>
              {gitConfig.mergeMode === 'auto_pr' && (
                <Input
                  placeholder="PR target branch"
                  value={gitConfig.prTargetBranch}
                  onChange={(e) => setGitConfig((g) => ({ ...g, prTargetBranch: e.target.value }))}
                />
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('name')}>Back</Button>
              <Button variant="ghost" onClick={() => { setGitConfig({ repoUrl: '', pullFromBranch: 'main', pushToBranch: 'main', mergeMode: 'auto_pr', prTargetBranch: '' }); setStep('node-dir'); }}>
                Skip
              </Button>
              <Button onClick={() => setStep('node-dir')}>Next →</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Node + Dir ── */}
        {step === 'node-dir' && (
          <>
            <DialogHeader>
              <DialogTitle>Node &amp; Directory (optional)</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <Select
                value={selectedNodeId}
                onValueChange={setSelectedNodeId}
                disabled={nodes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={nodes.length === 0 ? 'No connected nodes available' : 'Pick a node'} />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>{node.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedNodeId && (
                <NodeDirPicker
                  nodeId={selectedNodeId}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                />
              )}

              {selectedPath && (
                <p className="text-sm text-muted-foreground">Selected: <span className="font-mono">{selectedPath}</span></p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('git-config')}>Back</Button>
              <Button variant="ghost" onClick={() => onCreate(true)} disabled={isLoading}>
                Skip
              </Button>
              <Button onClick={() => onCreate(false)} disabled={isLoading}>
                {isLoading ? 'Creating…' : 'Create →'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
