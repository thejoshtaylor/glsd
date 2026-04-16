// GLSD -- Daily cost bar chart
// Uses recharts BarChart with responsive container

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCost } from '@/lib/format';
import type { DailyUsage } from '@/lib/api/usage';

interface UsageDailyChartProps {
  data: DailyUsage[];
  isLoading: boolean;
}

function formatDateLabel(d: string): string {
  // Append T00:00:00 to bare date strings to parse as local time, not UTC midnight
  const date = d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function UsageDailyChart({ data, isLoading }: UsageDailyChartProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold leading-none tracking-tight">Daily Cost</h3>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] sm:h-[300px] w-full" />
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-[240px] sm:h-[300px]">
            <p className="text-sm text-muted-foreground">No node activity in this period</p>
          </div>
        ) : (
          <div className="h-[240px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `$${v}`}
                  width={50}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [formatCost(value), 'Cost']}
                  labelFormatter={formatDateLabel}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--card-foreground))',
                  }}
                />
                <Bar
                  dataKey="cost_usd"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
