import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis } from "recharts";
import type { AssetMovement } from "@/api/assetMovements.api";
import { movementTypeLabel } from "@/utils/movementType";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type BarShapeProps = { payload?: Record<string, number> };

/** Highest series that actually has a value in this column, so the cap is visible. */
function topSeriesOf(series: string[], row?: Record<string, number>) {
  if (!row) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    if ((row[series[i]] ?? 0) > 0) return series[i];
  }
  return null;
}

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Monday-anchored week start, so buckets are stable regardless of today. */
function weekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
}

export function MovementsByTypeChart({
  movements,
  days = 56,
}: {
  movements: AssetMovement[];
  days?: number;
}) {
  // Short ranges bucket by day; anything longer would produce one or two fat bars.
  const byDay = days <= 14;
  const step = byDay ? 1 : 7;
  const bucketCount = Math.max(1, Math.ceil(days / step));
  const series = [...new Set(movements.map((movement) => movement.movementType))].sort();
  const config = Object.fromEntries(
    series.map((movementType, index) => [
      movementType,
      {
        label: movementTypeLabel(movementType),
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      },
    ])
  ) satisfies ChartConfig;

  const buckets = new Map<string, Record<string, number>>();
  const anchor = byDay ? startOfDay(new Date()) : weekStart(new Date());

  for (let i = bucketCount - 1; i >= 0; i--) {
    const start = new Date(anchor);
    start.setDate(start.getDate() - i * step);
    buckets.set(start.toISOString().slice(0, 10), Object.fromEntries(series.map((type) => [type, 0])));
  }

  movements.forEach((movement) => {
    const date = new Date(movement.movementDate);
    const key = (byDay ? startOfDay(date) : weekStart(date)).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) bucket[movement.movementType] += 1;
  });

  const data = [...buckets.entries()].map(([key, counts]) => ({
    week: new Date(key).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    ...counts,
  }));

  const label = byDay ? `last ${bucketCount} days` : `last ${bucketCount} weeks`;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Movements by Type</CardTitle>
        <CardDescription>{byDay ? "Daily" : "Weekly"} breakdown over the {label}</CardDescription>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            No movements recorded in this period.
          </p>
        ) : (
        <ChartContainer config={config} className="h-72 w-full">
          {/* Bars are capped rather than filling their band: with only a handful of
              buckets they would otherwise render as ~45px slabs. */}
          <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }} maxBarSize={24}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {series.map((movementType) => (
              <Bar
                key={movementType}
                dataKey={movementType}
                stackId="movements"
                fill={`var(--color-${series})`}
                // 2px surface gap between stacked segments.
                stroke="var(--color-card)"
                strokeWidth={2}
                // The cap has to be decided per column, not per series: whichever
                // series happens to be highest varies bar by bar, so a fixed index
                // rounds a buried segment on any column where that series is zero.
                shape={(props: BarShapeProps) => (
                  <Rectangle
                    {...props}
                    radius={topSeriesOf(series, props.payload) === movementType ? [6, 6, 0, 0] : 0}
                  />
                )}
              />
            ))}
          </BarChart>
        </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
