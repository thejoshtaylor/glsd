import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FolderInput,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  Server,
  Github,
} from "lucide-react";
import NodeDirPicker from "@/components/shared/node-dir-picker";
import { useNodes } from "@/lib/queries";
import { createProject, addProjectNode, createProjectGitConfig } from "@/lib/api/projects";
import {
  listInstallations,
  listInstallationRepos,
  getInstallUrl,
  type GitHubInstallation,
  type GitHubRepo,
} from "@/lib/api/github";
import { toast } from "sonner";

export interface ImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (projectId: string) => void;
  /** When true, renders inner content only — no Dialog wrapper. Used when embedded in another dialog. */
  inline?: boolean;
}

type Step =
  | "mode"
  | "node-select"
  | "node-browse"
  | "node-confirm"
  | "github-installation"
  | "github-repo"
  | "github-confirm"
  | "importing"
  | "complete"
  | "error";

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <ArrowLeft className="mr-2 h-4 w-4" />Back
    </Button>
  );
}

function ImportProjectContent({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("mode");
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Node path state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [nodeProjectName, setNodeProjectName] = useState("");

  // GitHub path state
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [githubProjectName, setGithubProjectName] = useState("");

  const { data: nodesData } = useNodes();
  const nodes = (nodesData?.data ?? []).filter((n) => !n.is_revoked);

  const { data: installations, isLoading: installationsLoading } = useQuery({
    queryKey: ["github-installations"],
    queryFn: listInstallations,
    enabled: step === "github-installation",
  });

  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: ["github-repos", selectedInstallationId],
    queryFn: () => listInstallationRepos(selectedInstallationId!),
    enabled: step === "github-repo" && !!selectedInstallationId,
  });

  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedPath("");
    setStep("node-browse");
  }, []);

  const handlePathSelect = useCallback((path: string) => {
    setSelectedPath(path);
    const name = path.split("/").filter(Boolean).pop() ?? "project";
    setNodeProjectName(name);
    setStep("node-confirm");
  }, []);

  const handleInstallationSelect = useCallback((installation: GitHubInstallation) => {
    setSelectedInstallationId(installation.id);
    setStep("github-repo");
  }, []);

  const handleRepoSelect = useCallback((repo: GitHubRepo) => {
    setSelectedRepo(repo);
    const name = repo.full_name.split("/").pop() ?? repo.full_name;
    setGithubProjectName(name);
    setStep("github-confirm");
  }, []);

  const handleNodeSubmit = useCallback(async () => {
    if (!selectedNodeId || !selectedPath || !nodeProjectName.trim()) return;
    setStep("importing");
    setError(null);
    try {
      const project = await createProject({ name: nodeProjectName.trim() });
      await addProjectNode(project.id, {
        node_id: selectedNodeId,
        local_path: selectedPath,
        is_primary: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["server-projects"] });
      setProjectId(project.id);
      setStep("complete");
      onSuccess?.(project.id);
      toast.success("Project imported successfully!", {
        action: {
          label: "Open Project",
          onClick: () => void navigate(`/projects/${project.id}`),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [selectedNodeId, selectedPath, nodeProjectName, queryClient, onSuccess, navigate]);

  const handleGitHubSubmit = useCallback(async () => {
    if (!selectedRepo || !githubProjectName.trim()) return;
    setStep("importing");
    setError(null);
    try {
      const project = await createProject({ name: githubProjectName.trim() });
      await createProjectGitConfig(project.id, {
        repo_url: selectedRepo.html_url,
        pull_from_branch: "main",
        push_to_branch: "main",
        merge_mode: "auto_pr",
      });
      await queryClient.invalidateQueries({ queryKey: ["server-projects"] });
      setProjectId(project.id);
      setStep("complete");
      onSuccess?.(project.id);
      toast.success("Project imported successfully!", {
        action: {
          label: "Open Project",
          onClick: () => void navigate(`/projects/${project.id}`),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [selectedRepo, githubProjectName, queryClient, onSuccess, navigate]);

  const handleViewProject = useCallback(() => {
    if (projectId) {
      void navigate(`/projects/${projectId}`);
      onClose();
    }
  }, [projectId, navigate, onClose]);

  const isTerminalStep = step === "importing" || step === "complete" || step === "error";

  const description: Record<Step, string> = {
    mode: "Choose how to import your project.",
    "node-select": "Select the node where your project lives.",
    "node-browse": "Browse to the project folder on the node.",
    "node-confirm": "Confirm the project name before importing.",
    "github-installation": "Select a GitHub App installation.",
    "github-repo": "Select the repository to import.",
    "github-confirm": "Confirm the project name before importing.",
    importing: "Importing project…",
    complete: "Project imported successfully.",
    error: "Failed to import project.",
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FolderInput className="h-5 w-5 text-primary" />
          Import Existing Project
        </DialogTitle>
        {!isTerminalStep && (
          <DialogDescription>{description[step]}</DialogDescription>
        )}
      </DialogHeader>

      {/* MODE step */}
      {step === "mode" && (
        <div className="grid grid-cols-2 gap-3 py-4">
          <button
            className="flex flex-col items-center gap-3 rounded-lg border border-border p-5 hover:bg-muted transition-colors text-left"
            onClick={() => setStep("node-select")}
          >
            <Server className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium text-sm">Import from Node</p>
              <p className="text-xs text-muted-foreground mt-0.5">Browse files on a connected node</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground self-end" />
          </button>
          <button
            className="flex flex-col items-center gap-3 rounded-lg border border-border p-5 hover:bg-muted transition-colors text-left"
            onClick={() => setStep("github-installation")}
          >
            <Github className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium text-sm">Import from GitHub</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pick a repo from a GitHub App</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground self-end" />
          </button>
        </div>
      )}

      {/* NODE-SELECT step */}
      {step === "node-select" && (
        <div className="space-y-2 py-4">
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No nodes connected. Go to Settings &gt; Nodes to add one.
            </p>
          ) : (
            nodes.map((node) => (
              <button
                key={node.id}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors text-left"
                onClick={() => handleNodeSelect(node.id)}
              >
                <Server className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{node.name}</p>
                  {node.machine_id && (
                    <p className="text-xs text-muted-foreground">{node.machine_id}</p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      )}

      {/* NODE-BROWSE step */}
      {step === "node-browse" && selectedNodeId && (
        <div className="py-4">
          <NodeDirPicker
            nodeId={selectedNodeId}
            selectedPath={selectedPath}
            onSelect={handlePathSelect}
          />
        </div>
      )}

      {/* NODE-CONFIRM step */}
      {step === "node-confirm" && (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm font-mono text-muted-foreground truncate">
            {selectedPath}
          </div>
          <div className="space-y-2">
            <Label htmlFor="node-project-name">Project name</Label>
            <Input
              id="node-project-name"
              value={nodeProjectName}
              onChange={(e) => setNodeProjectName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* GITHUB-INSTALLATION step */}
      {step === "github-installation" && (
        <div className="space-y-2 py-4">
          {installationsLoading && (
            <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading installations…
            </div>
          )}
          {!installationsLoading && (!installations || installations.length === 0) && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No GitHub installations.{" "}
              <a
                href="#"
                className="underline hover:text-foreground"
                onClick={async (e) => {
                  e.preventDefault();
                  const { url } = await getInstallUrl();
                  window.open(url, "_blank");
                }}
              >
                Connect a GitHub App in Settings.
              </a>
            </p>
          )}
          {installations?.map((inst) => (
            <button
              key={inst.id}
              className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors text-left"
              onClick={() => handleInstallationSelect(inst)}
            >
              <Github className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{inst.account_login}</p>
                <p className="text-xs text-muted-foreground">{inst.account_type}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* GITHUB-REPO step */}
      {step === "github-repo" && (
        <div className="space-y-2 py-4">
          {reposLoading && (
            <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading repositories…
            </div>
          )}
          {!reposLoading && (!repos || repos.length === 0) && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No repositories found in this installation.
            </p>
          )}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {repos?.map((repo) => (
              <button
                key={repo.id}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors text-left"
                onClick={() => handleRepoSelect(repo)}
              >
                <Github className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{repo.full_name}</p>
                  {repo.private && (
                    <p className="text-xs text-muted-foreground">Private</p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GITHUB-CONFIRM step */}
      {step === "github-confirm" && (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm font-mono text-muted-foreground truncate">
            {selectedRepo?.html_url}
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-project-name">Project name</Label>
            <Input
              id="github-project-name"
              value={githubProjectName}
              onChange={(e) => setGithubProjectName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* IMPORTING step */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Importing project…</p>
        </div>
      )}

      {/* COMPLETE step */}
      {step === "complete" && (
        <div className="flex flex-col items-center justify-center py-12">
          <CheckCircle className="h-12 w-12 text-status-success mb-4" />
          <h3 className="text-lg font-medium">Project Imported</h3>
          <p className="text-muted-foreground mt-1 text-center text-sm">
            Your project has been imported successfully.
          </p>
        </div>
      )}

      {/* ERROR step */}
      {step === "error" && (
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium">Import Failed</h3>
          <p className="text-destructive mt-1 text-sm text-center max-w-sm">{error}</p>
        </div>
      )}

      <DialogFooter>
        {step === "mode" && <Button variant="outline" onClick={onClose}>Cancel</Button>}
        {step === "node-select" && <BackButton onClick={() => setStep("mode")} />}
        {step === "node-browse" && <BackButton onClick={() => setStep("node-select")} />}
        {step === "node-confirm" && (
          <>
            <BackButton onClick={() => setStep("node-browse")} />
            <Button onClick={() => void handleNodeSubmit()} disabled={!nodeProjectName.trim()}>
              Import Project <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
        {step === "github-installation" && <BackButton onClick={() => setStep("mode")} />}
        {step === "github-repo" && <BackButton onClick={() => setStep("github-installation")} />}
        {step === "github-confirm" && (
          <>
            <BackButton onClick={() => setStep("github-repo")} />
            <Button onClick={() => void handleGitHubSubmit()} disabled={!githubProjectName.trim()}>
              Import Project <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
        {step === "importing" && (
          <Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</Button>
        )}
        {step === "complete" && (
          <>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleViewProject}>View Project</Button>
          </>
        )}
        {step === "error" && (
          <>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => setStep("mode")}>Try Again</Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

export function ImportProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  inline,
}: ImportProjectDialogProps) {
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  if (inline) {
    return <ImportProjectContent onClose={handleClose} onSuccess={onSuccess} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ImportProjectContent onClose={handleClose} onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}
