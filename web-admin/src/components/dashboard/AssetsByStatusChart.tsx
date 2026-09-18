import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";import type { Asset } from "@/api/assets.api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Every asset holds exactly one status, so this is part-to-whole and reads as a
 * single 100% bar. A donut was the other candidate and was rejected: the counts
 * sit close together (two are identical), and pie/donut is for part-to-whole at a
 * glance, not for comparing near-equal values.
 *
 * Capped at five slices because that is how many series colours are validated;
 * anything beyond folds into "Other" rather than inventing a sixth hue.
 */
/** Subset of the label props we rely on; Recharts types them loosely. */
type LabelProps = { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown };

const MAX_SLICES = 5;

const readable = (status: string) =>
  status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function AssetsByStatusChart({ assets }: { assets: Asset[] }) {
  const counts = new Map<string, number>();
  assets.forEach((asset) => {
    const status = asset.status || "UNKNOWN";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  });

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const head = ranked.slice(0, MAX_SLICES);
  const tail = ranked.slice(MAX_SLICES);
  const slices = tail.length
    ? [...head, ["OTHER", tail.reduce((sum, [, n]) => sum + n, 0)] as [string, number]]
    : head;

  const total = assets.length;
  const config: ChartConfig = Object.fromEntries(
    slices.map(([status], index) => [
      status,
      { label: readable(status), color: `var(--chart-${index + 1})` },
    ])
  );
  const row = Object.fromEntries(slices.map(([status, count]) => [status, count]));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Assets by Status</CardTitle>
        <CardDescription>Share of {total} assets by operational state</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No assets to chart yet.</p>
        ) : (
          <>
            {/*
              The rounded ends come from clipping this wrapper, not from a radius on
              a particular segment. Recharts does not stack in the order the bars are
              declared, so picking the "first" or "last" slice by array position caps
              the wrong colour — the clip always rounds whichever segments actually
              sit at the two ends. The wrapper is exactly the bar's height so the
              corners land on the bar rather than around it.
            */}
            <div className="overflow-hidden rounded-lg">
              <ChartContainer config={config} className="h-11 w-full">
                <BarChart
                  accessibilityLayer
                  layout="vertical"
                  data={[row]}
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                >
                  {/* Pinned to the exact total: left to "auto" Recharts rounds the
                      max up to a nice number, leaving a gap at the right end that the
                      clip would round in empty space instead of on the bar. */}
                  <XAxis type="number" domain={[0, total]} hide />
                  <YAxis type="category" hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {slices.map(([status]) => (
                    <Bar
                      key={status}
                      dataKey={status}
                      stackId="status"
                      fill={`var(--color-${status})`}
                      // 2px surface gap between touching segments.
                      stroke="var(--color-card)"
                      strokeWidth={2}
                      barSize={44}
                    >
                      {/*
                        Drawn only when the number actually fits the segment, measured
                        in pixels rather than as a share of the total — a fixed
                        percentage drops the value on narrow segments even when there
                        is room, and keeps it on wide-but-small ones when there is not.
                      */}
                      <LabelList
                        dataKey={status}
                        position="center"
                        className="fill-white"
                        fontSize={12}
                        content={(props: LabelProps) => {
                          const { x, y, width, height, value } = props;
                          if (
                            typeof x !== "number" || typeof y !== "number" ||
                            typeof width !== "number" || typeof height !== "number"
                          ) return null;
                          const text = String(value ?? "");
                          // ~7px per digit, plus 8px of breathing room either side.
                          if (!text || width < text.length * 7 + 16) return null;
                          return (
                            <text
                              x={x + width / 2}
                              y={y + height / 2}
                              fill="#fff"
                              fontSize={12}
                              textAnchor="middle"
                              dominantBaseline="central"
                            >
                              {text}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  ))}
                </BarChart>
              </ChartContainer>
            </div>

            {/* The legend doubles as the table view: every slice's exact value and
                share is readable without hovering, which is what the low-contrast
                slots require. */}
            <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {slices.map(([status, count], index) => (
                <li key={status} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ background: `var(--chart-${index + 1})` }}
                  />
                  <span className="flex-1 truncate text-muted-foreground">{readable(status)}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                    {Math.round((count / total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
