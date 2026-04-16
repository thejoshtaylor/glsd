// GLSD — Node File Browser Page
// Wraps FileBrowser for the /nodes/:nodeId/files route

import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileBrowser } from '@/components/project/file-browser';

export function NodeFileBrowserPage() {
  const { nodeId } = useParams<{ nodeId: string }>();

  if (!nodeId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Node not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Back navigation */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/nodes/${nodeId}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Node
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">/ Files</span>
      </div>

      {/* File browser fills remaining height */}
      <div className="flex-1 min-h-0">
        <FileBrowser nodeId={nodeId} initialPath="/" />
      </div>
    </div>
  );
}
