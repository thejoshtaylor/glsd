import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { createProject, createProjectGitConfig } from '../../lib/api/projects';
import { listInstallations, listInstallationRepos, GitHubInstallation, GitHubRepo } from '../../lib/api/github';

// ── BlankProjectDialog ─────────────────────────────────────────────────────

export interface BlankProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'entry' | 'name';

export function BlankProjectDialog({ open, onOpenChange }: BlankProjectDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('entry');
  const [name, setName] = useState('');
  const [selectedInstallationId, setSelectedInstallationId] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: installations = [] } = useQuery<GitHubInstallation[]>({
    queryKey: ['github-installations'],
    queryFn: listInstallations,
  });

  const { data: repos = [], isFetching: reposFetching } = useQuery<GitHubRepo[]>({
    queryKey: ['github-repos', selectedInstallationId],
    queryFn: () => listInstallationRepos(selectedInstallationId),
    enabled: !!selectedInstallationId,
  });

  function reset() {
    setStep('entry');
    setName('');
    setSelectedInstallationId('');
    setSelectedRepo(null);
    setError(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function onCreate() {
    setIsLoading(true);
    setError(null);
    try {
      const project = await createProject({ name: name.trim() });
      if (selectedRepo) {
        try {
          await createProjectGitConfig(project.id, {
            repo_url: selectedRepo.html_url,
            pull_from_branch: 'main',
            push_to_branch: 'main',
            merge_mode: 'auto_pr',
            pr_target_branch: null,
          });
        } catch (e: unknown) {
          if (!(e instanceof Error && e.message.includes('409'))) throw e;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['server-projects'] });
      handleOpenChange(false);
      // R103: navigate to project dashboard immediately after creation
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
              <button
                className="flex flex-col gap-2 rounded-lg border p-4 text-left hover:border-primary hover:bg-muted transition-colors"
                onClick={() => setStep('name')}
              >
                <span className="font-semibold">Blank / Existing</span>
                <span className="text-sm text-muted-foreground">
                  Create a project from an existing codebase or start blank.
                </span>
              </button>

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

        {/* ── Name + optional GitHub picker ── */}
        {step === 'name' && (
          <>
            <DialogHeader>
              <DialogTitle>Project Name</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-5 py-4">
              <Input
                autoFocus
                placeholder="My project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onCreate(); }}
              />

              {/* GitHub picker section */}
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Link a GitHub repository (optional)</p>

                {installations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No GitHub apps connected.{' '}
                    <Link to="/settings" className="underline" onClick={() => handleOpenChange(false)}>
                      Connect one in Settings.
                    </Link>
                  </p>
                ) : (
                  <>
                    <Select
                      value={selectedInstallationId}
                      onValueChange={(v) => {
                        setSelectedInstallationId(v);
                        setSelectedRepo(null);
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
                          value={selectedRepo?.full_name ?? ''}
                          onValueChange={(v) => {
                            const repo = repos.find((r) => r.full_name === v) ?? null;
                            setSelectedRepo(repo);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a repository" />
                          </SelectTrigger>
                          <SelectContent>
                            {repos.map((repo) => (
                              <SelectItem key={repo.id} value={repo.full_name}>
                                <span>{repo.full_name}</span>
                                {repo.private && (
                                  <Badge variant="secondary" className="ml-2 text-xs">Private</Badge>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    )}

                    {selectedRepo && (
                      <p className="text-sm text-muted-foreground">
                        Selected: <span className="font-mono text-sm">{selectedRepo.full_name}</span>
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button disabled={!name.trim() || isLoading} onClick={onCreate}>
                {isLoading ? 'Creating…' : 'Create →'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
