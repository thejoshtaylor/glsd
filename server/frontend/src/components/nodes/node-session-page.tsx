import { useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { InteractiveTerminal } from "@/components/terminal/interactive-terminal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function NodeSessionPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cwdParam = searchParams.get("cwd") ?? "";

  const [cwdInput, setCwdInput] = useState("");

  // If cwd is present in URL, render terminal immediately
  // If cwd is absent, show a form to enter it
  const activeCwd = cwdParam;

  if (!nodeId) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-destructive">Missing node ID.</p>
      </div>
    );
  }

  if (activeCwd) {
    return (
      <div className="flex flex-col h-full">
        {/* Back link */}
        <div className="px-4 py-2 flex-shrink-0">
          <Link
            to={`/nodes/${nodeId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Node
          </Link>
          <span className="ml-4 text-xs text-muted-foreground font-mono">{activeCwd}</span>
        </div>
        {/* Terminal fills remaining space */}
        <div className="flex-1 min-h-0 px-4 pb-4">
          <InteractiveTerminal
            nodeId={nodeId}
            workingDirectory={activeCwd}
            persistKey={`session:${nodeId}`}
            autoConnect={true}
          />
        </div>
      </div>
    );
  }

  // No cwd in URL -- show input form
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link
        to={`/nodes/${nodeId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Node
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a Session</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (cwdInput.trim()) {
                void navigate(`/nodes/${nodeId}/session?cwd=${encodeURIComponent(cwdInput.trim())}`);
              }
            }}
          >
            <Input
              type="text"
              placeholder="/home/user/project"
              value={cwdInput}
              onChange={(e) => setCwdInput(e.target.value)}
              className="flex-1 font-mono text-sm"
              autoFocus
            />
            <Button type="submit" disabled={!cwdInput.trim()}>
              Start
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Enter the absolute path on the node where Claude Code should run.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
