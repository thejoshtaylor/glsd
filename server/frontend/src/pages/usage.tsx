// GSD Cloud -- Usage dashboard page
// D-11, D-12: Summary cards, node breakdown, daily chart, session table with period selector

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/lib/query-keys';
import { getUsageSummary, getUsageList } from '@/lib/api/usage';
import type { Period } from '@/lib/api/usage';
import { UsageSummaryCards } from '@/components/usage/usage-summary-cards';
import { UsageNodeBreakdown } from '@/components/usage/usage-node-breakdown';
import { UsageDailyChart } from '@/components/usage/usage-daily-chart';
import { UsageSessionTable } from '@/components/usage/usage-session-table';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

export function UsagePage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [page, setPage] = useState(1);

  // Reset page when period changes
  useEffect(() => {
    setPage(1);
  }, [period]);

  const summaryQuery = useQuery({
    queryKey: queryKeys.usageSummary(period),
    queryFn: () => getUsageSummary(period),
  });

  const listQuery = useQuery({
    queryKey: queryKeys.usage(period, page),
    queryFn: () => getUsageList(period, page),
  });

  const isError = summaryQuery.isError || listQuery.isError;

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in">
      <div className="px-8 pt-6 pb-4">
        <PageHeader
          title="Usage"
          description="Track token usage and costs across your sessions"
          icon={<BarChart3 className="h-6 w-6 text-muted-foreground" />}
          actions={
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-8 pb-8">
        {isError ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              Failed to load usage data. Check your connection and try again.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <UsageSummaryCards
              totalCost={summaryQuery.data?.total_cost_usd ?? 0}
              totalSessions={summaryQuery.data?.total_sessions ?? 0}
              isLoading={summaryQuery.isLoading}
            />

            <UsageNodeBreakdown
              nodes={summaryQuery.data?.by_node ?? []}
              totalCost={summaryQuery.data?.total_cost_usd ?? 0}
              isLoading={summaryQuery.isLoading}
            />

            <UsageDailyChart
              data={summaryQuery.data?.daily ?? []}
              isLoading={summaryQuery.isLoading}
            />

            <UsageSessionTable
              data={listQuery.data?.data ?? []}
              total={listQuery.data?.total ?? 0}
              page={listQuery.data?.page ?? page}
              totalPages={listQuery.data?.total_pages ?? 1}
              onPageChange={setPage}
              isLoading={listQuery.isLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
