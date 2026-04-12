// GSD Cloud -- Usage summary stat cards
// D-11: Total Cost, Total Sessions, Avg Cost/Session

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCost } from '@/lib/format';

interface UsageSummaryCardsProps {
  totalCost: number;
  totalSessions: number;
  isLoading: boolean;
}

export function UsageSummaryCards({ totalCost, totalSessions, isLoading }: UsageSummaryCardsProps) {
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <p className="text-xs text-muted-foreground">Total Cost</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <p className="text-3xl sm:text-4xl font-bold" style={{ fontFeatureSettings: "'tnum'" }}>
              {formatCost(totalCost)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-xs text-muted-foreground">Total Sessions</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <p className="text-3xl sm:text-4xl font-bold" style={{ fontFeatureSettings: "'tnum'" }}>
              {totalSessions}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-xs text-muted-foreground">Avg Cost / Session</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <p className="text-3xl sm:text-4xl font-bold" style={{ fontFeatureSettings: "'tnum'" }}>
              {formatCost(avgCost)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
