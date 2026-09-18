import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import type { Asset } from "@/api/assets.api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** Category names are long, so the bars run horizontally and read as a ranked list. */
const config = {
  count: { label: "Assets", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Past this the tail is noise; it folds into a single "Other" row. */
const TOP_N = 8;

export function AssetsByCategoryChart({ assets }: { assets: Asset[] }) {
  const counts = new Map<string, number>();
  assets.forEach((asset) => {
    const name = asset.category?.name || "Uncategorised";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  const ranked = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const head = ranked.slice(0, TOP_N);
  const tail = ranked.slice(TOP_N);
  const data = tail.length
    ? [...head, { category: `Other (${tail.length})`, count: tail.reduce((sum, item) => sum + item.count, 0) }]
    : head;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assets by Category</CardTitle>
        <CardDescription>
          {ranked.length} {ranked.length === 1 ? "category" : "categories"}
          {tail.length ? " · tail folded into Other" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No assets to chart yet.</p>
        ) : (
          <ChartContainer config={config} className="h-72 w-full">
            <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8, right: 36 }}>
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="category"
                type="category"
                tickLine={false}
                axisLine={false}
                width={150}
                tickMargin={8}
              />
              <XAxis type="number" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                // Single series, so the data-end is always the right edge.
                radius={[0, 8, 8, 0]}
                barSize={20}
              >
                <LabelList
                  dataKey="count"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
