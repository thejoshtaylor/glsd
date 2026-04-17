// GLSD — Node Detail Page
// Shows node info, active sessions, and provides a revoke action with confirmation.

import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Server, Wifi, WifiOff, Trash2, Monitor, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useNode, useSessions, useRevokeNode, useUpdateNode } from "@/lib/queries";
import type { NodePublic } from "@/lib/api/nodes";
import type { SessionPublic } from "@/lib/api/sessions";

/** Derive online status from connection timestamps. */
function isOnline(node: NodePublic): boolean {
  return node.connected_at !== null && node.disconnected_at === null;
}

/** Return a human-readable relative time string for a given ISO timestamp. */
function relativeTime(isoString: string | null): string {
  if (!isoString) return "never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString();
}

function SessionRow({ session }: { session: SessionPublic }) {
  const shortId = session.id.slice(0, 8);
  const statusColor =
    session.status === "running"
      ? "bg-green-500"
      : session.status === "completed"
        ? "bg-muted-foreground/40"
        : "bg-amber-500";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
      <span className="font-mono text-xs text-muted-foreground flex-shrink-0 w-20">{shortId}…</span>
      <span className="text-xs text-muted-foreground flex-1 truncate">{session.cwd || "—"}</span>
      <Badge variant="secondary" className="text-xs capitalize flex-shrink-0">
        {session.status}
      </Badge>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {relativeTime(session.created_at)}
      </span>
    </div>
  );
}

function NodeSettingsCard({ node }: { node: NodePublic }) {
  const [codeDir, setCodeDir] = useState(node.default_code_dir ?? "");
  const updateNode = useUpdateNode();

  async function handleSave() {
    try {
      await updateNode.mutateAsync({ nodeId: node.id, data: { default_code_dir: codeDir || null } });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Settings</CardTitle>
        <CardDescription>Configure default directories for this node.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Default code directory</label>
          <div className="flex gap-2">
            <Input
              value={codeDir}
              onChange={(e) => setCodeDir(e.target.value)}
              placeholder="/home/user/code"
              className="flex-1 font-mono text-sm"
            />
            <Button size="sm" onClick={handleSave} disabled={updateNode.isPending} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {updateNode.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function NodeDetailPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();

  const { data: node, isLoading, isError } = useNode(nodeId ?? "");
  const { data: sessionsData } = useSessions(nodeId);
  const revokeNode = useRevokeNode();

  const sessions = sessionsData?.data ?? [];

  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionCwd, setNewSessionCwd] = useState("");

  function handleRevoke() {
    if (!nodeId) return;
    revokeNode.mutate(nodeId, {
      onSuccess: () => {
        toast.success("Node revoked", {
          description: "The node has been disconnected and its token invalidated.",
        });
        void navigate("/nodes");
      },
      onError: () => {
        toast.error("Failed to revoke node", {
          description: "Please try again.",
        });
      },
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-5 bg-muted rounded w-24" />
        <div className="h-8 bg-muted rounded w-48 mt-4" />
        <div className="h-32 bg-muted rounded mt-4" />
      </div>
    );
  }

  if (isError || !node) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link to="/nodes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Nodes
        </Link>
        <div className="border border-destructive/40 rounded-lg p-6 text-center">
          <p className="text-sm text-destructive">Node not found or an error occurred.</p>
        </div>
      </div>
    );
  }

  const online = isOnline(node);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        to="/nodes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Nodes
      </Link>

      {/* Node info section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Server className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <div>
                <CardTitle className="text-xl">{node.name}</CardTitle>
                {node.machine_id && (
                  <CardDescription className="font-mono text-xs mt-0.5 truncate max-w-xs">
                    {node.machine_id}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {node.is_revoked ? (
                <Badge variant="destructive">Revoked</Badge>
              ) : online ? (
                <Badge variant="default" className="bg-green-500 flex items-center gap-1">
                  <Wifi className="h-3 w-3" />
                  Online
                </Badge>
              ) : (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  Offline
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Last seen</p>
            <p>{relativeTime(node.last_seen)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Created</p>
            <p>{formatDate(node.created_at)}</p>
          </div>
          {node.os && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">OS</p>
              <p>{node.os}{node.arch ? ` / ${node.arch}` : ""}</p>
            </div>
          )}
          {node.daemon_version && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Daemon version</p>
              <p className="font-mono">{node.daemon_version}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active sessions */}
      <Card className="mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Active Sessions</CardTitle>
          {online && !node.is_revoked && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowNewSession(!showNewSession)}
            >
              <Plus className="h-3.5 w-3.5" />
              New Session
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {showNewSession && (
            <form
              className="flex gap-2 mb-3 pb-3 border-b"
              onSubmit={(e) => {
                e.preventDefault();
                if (newSessionCwd.trim()) {
                  void navigate(`/nodes/${nodeId}/session?cwd=${encodeURIComponent(newSessionCwd.trim())}`);
                }
              }}
            >
              <Input
                type="text"
                placeholder="/absolute/path/to/project"
                value={newSessionCwd}
                onChange={(e) => setNewSessionCwd(e.target.value)}
                className="flex-1 font-mono text-sm"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={!newSessionCwd.trim()}>
                Start
              </Button>
            </form>
          )}
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No active sessions</p>
          ) : (
            <div>
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File browser link */}
      <Card className="mb-6">
        <CardContent className="pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Browse files on this node</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/nodes/${node.id}/files`}>Browse Files</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Settings */}
      <NodeSettingsCard node={node} />

      {/* Revoke section */}
      {!node.is_revoked && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Revoking a node disconnects it and permanently invalidates its token. The node will
              no longer be able to connect to this server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Revoke Node
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke node "{node.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently invalidate the node's token. The node will be
                    disconnected and cannot reconnect without a new pairing token. This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleRevoke}
                  >
                    {revokeNode.isPending ? "Revoking…" : "Revoke Node"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
