import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import NodeDirPicker from '@/components/shared/node-dir-picker';
import { useNodes, useAddProjectNode } from '@/lib/queries';
import type { NodePublic } from '@/lib/api/nodes';
import { getProjectGitConfig } from '@/lib/api/projects';
import { GsdWebSocket } from '@/lib/api/ws';

export interface AttachNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existingNodeCount: number;
}

export function AttachNodeDialog({
  open,
  onOpenChange,
  projectId,
  existingNodeCount,
}: AttachNodeDialogProps) {
  const queryClient = useQueryClient();
  const { data: nodesData, isLoading: nodesLoading } = useNodes();
  const addProjectNode = useAddProjectNode();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState('');
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nodes: NodePublic[] = nodesData?.data ?? [];
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // When a node is selected, pre-fill localPath from default_code_dir
  useEffect(() => {
    if (!selectedNode) return;
    if (selectedNode.default_code_dir) {
      setLocalPath(selectedNode.default_code_dir);
      setUseCustomPath(false);
    } else {
      setLocalPath('');
      setUseCustomPath(true);
    }
  }, [selectedNode]);

  function reset() {
    setSelectedNodeId(null);
    setLocalPath('');
    setUseCustomPath(false);
    setError(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function onSubmit() {
    if (!selectedNodeId || !localPath.trim()) return;
    setError(null);
    try {
      await addProjectNode.mutateAsync({
        projectId,
        data: {
          node_id: selectedNodeId,
          local_path: localPath.trim(),
          is_primary: existingNodeCount === 0,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['project-nodes', projectId] });

      // Best-effort gitClone: fetch git config and send WS message if present
      const machineId = selectedNode?.machine_id;
      if (machineId) {
        try {
          const gitConfig = await getProjectGitConfig(projectId);
          if (gitConfig) {
            const channelId = crypto.randomUUID();
            const requestId = crypto.randomUUID();
            const ws = new GsdWebSocket();
            ws.connect(channelId);
            ws.send({
              type: 'gitClone',
              requestId,
              channelId,
              machineId,
              repoUrl: gitConfig.repo_url,
              targetPath: localPath.trim(),
            });
            ws.disconnect();
          }
        } catch {
          // git config fetch failed — proceed without cloning
        }
      }

      handleOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to attach node');
    }
  }

  const canSubmit = !!selectedNodeId && localPath.trim().length > 0 && !addProjectNode.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a node</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {nodesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading nodes…
            </div>
          ) : nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No nodes registered. Pair a node first from the Nodes page.
            </p>
          ) : (
            <Select
              value={selectedNodeId ?? ''}
              onValueChange={(v) => setSelectedNodeId(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a node" />
              </SelectTrigger>
              <SelectContent>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.name}
                    {node.default_code_dir && (
                      <span className="ml-2 text-xs text-muted-foreground font-mono">
                        {node.default_code_dir}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selectedNodeId && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Project path on node</label>
                <Input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="/home/user/projects/my-project"
                  className="font-mono text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useCustomPath}
                  onChange={(e) => setUseCustomPath(e.target.checked)}
                  className="rounded"
                />
                Use custom path (browse node filesystem)
              </label>

              {useCustomPath && (
                <NodeDirPicker
                  nodeId={selectedNodeId}
                  selectedPath={localPath}
                  onSelect={setLocalPath}
                />
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit}>
            {addProjectNode.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              'Connect node'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
