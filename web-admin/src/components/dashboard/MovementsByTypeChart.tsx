import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis } from "recharts";
import type { AssetMovement } from "@/api/assetMovements.api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Three distinct series, so this is the one chart here doing a categorical job.
 * Slots 1-3 (blue/orange/aqua) are validated for all pairs on a white surface.
 * Aqua sits under 3:1 against the card, so identity is never carried by colour
 * alone: a legend is always present and the tooltip names every segment.
 */
const config = {
  LOCATION_TRANSFER: { label: "Location", color: "var(--chart-1)" },
  DEPARTMENT_TRANSFER: { label: "Department", color: "var(--chart-2)" },
  FULL_TRANSFER: { label: "Full", color: "var(--chart-3)" },
} satisfies ChartConfig;

const SERIES = Object.keys(config) as (keyof typeof config)[];

type BarShapeProps = { payload?: Record<string, number> };

/** Highest series that actually has a value in this column, so the cap is visible. */
function topSeriesOf(row?: Record<string, number>) {
  if (!row) return null;
  for (let i = SERIES.length - 1; i >= 0; i--) {
    if ((row[SERIES[i]] ?? 0) > 0) return SERIES[i];
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

  const buckets = new Map<string, Record<string, number>>();
  const anchor = byDay ? startOfDay(new Date()) : weekStart(new Date());

  for (let i = bucketCount - 1; i >= 0; i--) {
    const start = new Date(anchor);
    start.setDate(start.getDate() - i * step);
    buckets.set(start.toISOString().slice(0, 10), Object.fromEntries(SERIES.map((s) => [s, 0])));
  }

  movements.forEach((movement) => {
    const date = new Date(movement.movementDate);
    const key = (byDay ? startOfDay(date) : weekStart(date)).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    // Types outside the three known series are ignored rather than silently
    // folded into one of them.
    if (bucket && movement.movementType in bucket) bucket[movement.movementType] += 1;
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
        <ChartContainer config={config} className="h-72 w-full">
          {/* Bars are capped rather than filling their band: with only a handful of
              buckets they would otherwise render as ~45px slabs. */}
          <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }} maxBarSize={24}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {SERIES.map((series) => (
              <Bar
                key={series}
                dataKey={series}
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
                    radius={topSeriesOf(props.payload) === series ? [6, 6, 0, 0] : 0}
                  />
                )}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
