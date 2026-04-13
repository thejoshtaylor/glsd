// GSD Cloud — Nodes Dashboard Page
// Displays all paired nodes with online/offline status in a responsive card grid.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Server, WifiOff, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNodes } from "@/lib/queries";
import type { NodePublic } from "@/lib/api/nodes";
import { DeployNodeModal } from "./deploy-node-modal";

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

/** Derive online status from the node's connection timestamps.
 * NodePublic has no is_online field; we compute it from connected_at / disconnected_at.
 */
function isOnline(node: NodePublic): boolean {
  // is_online = connected_at is set and disconnected_at is null
  return node.connected_at !== null && node.disconnected_at === null;
}

function NodeCardSkeleton() {
  return (
    <div className="border rounded-lg bg-card animate-pulse">
      <div className="p-6 space-y-3">
        <div className="h-5 bg-muted rounded w-1/2" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/3" />
      </div>
    </div>
  );
}

function NodeCard({ node }: { node: NodePublic }) {
  const online = isOnline(node);

  return (
    <Link to={`/nodes/${node.id}`} className="block group">
      <Card className="h-full hover:border-border/80 transition-colors group-hover:shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base truncate">{node.name}</CardTitle>
            {node.is_revoked ? (
              <Badge variant="destructive" className="flex-shrink-0">Revoked</Badge>
            ) : online ? (
              <Badge variant="default" className="bg-green-500 flex-shrink-0">Online</Badge>
            ) : (
              <Badge variant="secondary" className="flex-shrink-0">Offline</Badge>
            )}
          </div>
          {node.machine_id && (
            <CardDescription className="font-mono text-xs truncate">
              {node.machine_id.length > 24
                ? `${node.machine_id.slice(0, 12)}…${node.machine_id.slice(-8)}`
                : node.machine_id}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Last seen: {relativeTime(node.last_seen)}</span>
          </div>
          {node.os && (
            <div className="text-xs">
              {node.os}{node.arch ? ` / ${node.arch}` : ""}
            </div>
          )}
          {node.created_at && (
            <div className="text-xs">
              Added {new Date(node.created_at).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function NodesPage() {
  const { data, isLoading, isError } = useNodes();
  const [deployOpen, setDeployOpen] = useState(false);

  const nodes = data?.data ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Server className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold">Nodes</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Manage your connected nodes
            </p>
          </div>
          <Button onClick={() => setDeployOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Deploy Node
          </Button>
        </div>
      </div>

      <DeployNodeModal open={deployOpen} onOpenChange={setDeployOpen} />

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <NodeCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="border border-destructive/40 rounded-lg p-6 text-center">
          <p className="text-sm text-destructive">Failed to load nodes. Please try again.</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && nodes.length === 0 && (
        <div className="border border-dashed rounded-lg p-10 text-center">
          <Server className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No nodes paired yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs mx-auto">
            Deploy a node agent on the machine you want to control.
          </p>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => setDeployOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Deploy your first node
            </Button>
          </div>
        </div>
      )}

      {/* Node grid */}
      {!isLoading && !isError && nodes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}
