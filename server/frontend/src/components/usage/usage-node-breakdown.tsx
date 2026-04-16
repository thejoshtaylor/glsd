// GLSD -- Per-node cost breakdown with progress bars
// D-11: Node totals with progress bars sorted by cost descending

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCost } from '@/lib/format';
import type { NodeUsage } from '@/lib/api/usage';

interface UsageNodeBreakdownProps {
  nodes: NodeUsage[];
  totalCost: number;
  isLoading: boolean;
}

export function UsageNodeBreakdown({ nodes, totalCost, isLoading }: UsageNodeBreakdownProps) {
  const sorted = [...nodes].sort((a, b) => b.cost_usd - a.cost_usd);

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold leading-none tracking-tight">Cost by Node</h3>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No node activity in this period</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((node) => {
              const pct = totalCost > 0 ? (node.cost_usd / totalCost) * 100 : 0;
              return (
                <div key={node.node_id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{node.node_name}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatCost(node.cost_usd)} &middot; {node.session_count} session{node.session_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Progress value={pct} size="lg" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
