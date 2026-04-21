import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Link } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  listInstallations,
  listInstallationRepos,
  type GitHubInstallation,
  type GitHubRepo,
} from '@/lib/api/github';
import { useCreateProjectGitConfig } from '@/lib/queries';

export interface AttachGitHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function AttachGitHubDialog({ open, onOpenChange, projectId }: AttachGitHubDialogProps) {
  const queryClient = useQueryClient();
  const createGitConfig = useCreateProjectGitConfig();

  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: installations = [] } = useQuery<GitHubInstallation[]>({
    queryKey: ['github-installations'],
    queryFn: listInstallations,
  });

  const { data: repos = [], isFetching: reposFetching } = useQuery<GitHubRepo[]>({
    queryKey: ['github-repos', selectedInstallationId],
    queryFn: () => listInstallationRepos(selectedInstallationId!),
    enabled: !!selectedInstallationId,
  });

  function reset() {
    setSelectedInstallationId(null);
    setSelectedRepoUrl(null);
    setError(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function onSubmit() {
    if (!selectedRepoUrl) return;
    setError(null);
    try {
      await createGitConfig.mutateAsync({
        projectId,
        data: {
          repo_url: selectedRepoUrl,
          pull_from_branch: 'main',
          push_to_branch: 'main',
          merge_mode: 'auto_pr',
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['project-git-config', projectId] });
      handleOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to connect GitHub repository');
    }
  }

  const canSubmit = !!selectedRepoUrl && !createGitConfig.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect GitHub</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {installations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No GitHub apps connected.{' '}
              <span
                className="cursor-pointer underline"
                onClick={() => handleOpenChange(false)}
              >
                Connect one in Settings.
              </span>
            </p>
          ) : (
            <>
              <Select
                value={selectedInstallationId ?? ''}
                onValueChange={(v) => {
                  setSelectedInstallationId(v || null);
                  setSelectedRepoUrl(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a GitHub account" />
                </SelectTrigger>
                <SelectContent>
                  {installations.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.account_login}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedInstallationId && (
                reposFetching ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading repositories…
                  </div>
                ) : (
                  <Select
                    value={selectedRepoUrl ?? ''}
                    onValueChange={(v) => setSelectedRepoUrl(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={repo.html_url}>
                          <span>{repo.full_name}</span>
                          {repo.private && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Private
                            </Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              )}

              {selectedRepoUrl && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Link className="h-3 w-3" />
                  <span className="font-mono text-xs">{selectedRepoUrl}</span>
                </div>
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
            {createGitConfig.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              'Connect repository'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
