import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { AssetMovement } from "@/api/assetMovements.api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** Trend over time with one series: no legend needed, the title names it. */
const config = {
  movements: { label: "Movements", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function MovementsTrendChart({
  movements,
  days = 30,
}: {
  movements: AssetMovement[];
  days?: number;
}) {
  const DAYS = days;
  const counts = new Map<string, number>();
  movements.forEach((movement) => {
    const key = new Date(movement.movementDate).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  // Every day in the window is emitted, so quiet days read as zero rather than
  // being skipped — a gap would misrepresent the shape of the trend.
  const today = new Date();
  const data = Array.from({ length: DAYS }, (_, offset) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (DAYS - 1 - offset));
    const key = day.toISOString().slice(0, 10);
    return {
      day: key,
      label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      movements: counts.get(key) ?? 0,
    };
  });

  const total = data.reduce((sum, point) => sum + point.movements, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Movement Activity</CardTitle>
        <CardDescription>{total} movements recorded in the last {DAYS} days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-72 w-full">
          <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <defs>
              <linearGradient id="movements-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-movements)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-movements)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <Area
              dataKey="movements"
              type="monotone"
              stroke="var(--color-movements)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#movements-fill)"
              // 2px ring in the surface colour, per the mark spec for end-markers.
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-card)" }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
