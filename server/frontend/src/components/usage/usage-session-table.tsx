// GLSD -- Paginated session usage table
// D-13: 25 rows per page with Prev/Next controls

import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCost, formatDuration, formatTokenCount } from '@/lib/format';
import type { UsageRecord } from '@/lib/api/usage';

interface UsageSessionTableProps {
  data: UsageRecord[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UsageSessionTable({
  data, total, page, totalPages, onPageChange, isLoading,
}: UsageSessionTableProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <h3 className="font-semibold leading-none tracking-tight">Recent Sessions</h3>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm font-medium">No usage data yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Usage data will appear here after your first completed session. Start a Claude Code session on any connected node.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-xs text-muted-foreground font-normal pb-2 pr-4">Date</th>
                  <th className="text-left text-xs text-muted-foreground font-normal pb-2 pr-4">Node</th>
                  <th className="text-right text-xs text-muted-foreground font-normal pb-2 pr-4">In Tokens</th>
                  <th className="text-right text-xs text-muted-foreground font-normal pb-2 pr-4">Out Tokens</th>
                  <th className="text-right text-xs text-muted-foreground font-normal pb-2 pr-4">Cost</th>
                  <th className="text-right text-xs text-muted-foreground font-normal pb-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatShortDate(row.created_at)}</td>
                    <td className="py-2 pr-4">{row.node_name}</td>
                    <td className="py-2 pr-4 text-right font-mono">{formatTokenCount(row.input_tokens)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{formatTokenCount(row.output_tokens)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{formatCost(row.cost_usd)}</td>
                    <td className="py-2 text-right">{formatDuration(row.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {totalPages > 1 && (
        <CardFooter className="justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
