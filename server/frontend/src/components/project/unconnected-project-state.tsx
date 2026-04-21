import { useState } from 'react';
import { Network, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttachNodeDialog } from './attach-node-dialog';
import { AttachGitHubDialog } from './attach-github-dialog';

export interface UnconnectedProjectStateProps {
  projectId: string;
  existingNodeCount?: number;
}

export function UnconnectedProjectState({ projectId, existingNodeCount = 0 }: UnconnectedProjectStateProps) {
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-full bg-muted p-4">
          <Network className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Project not connected</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Connect a node to run sessions, or link a GitHub repository to enable git-based workflows.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => setNodeDialogOpen(true)}>
          <Network className="mr-2 h-4 w-4" />
          Connect a node
        </Button>
        <Button variant="outline" onClick={() => setGithubDialogOpen(true)}>
          <Github className="mr-2 h-4 w-4" />
          Connect GitHub
        </Button>
      </div>

      <AttachNodeDialog
        open={nodeDialogOpen}
        onOpenChange={setNodeDialogOpen}
        projectId={projectId}
        existingNodeCount={existingNodeCount}
      />
      <AttachGitHubDialog
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        projectId={projectId}
      />
    </div>
  );
}
