import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import type { Asset } from "@/api/assets.api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

/**
 * A single ratio against a limit is a meter, not a chart of two categories —
 * a two-slice pie for "tagged vs untagged" would be the wrong form. The track is
 * the same ramp as the fill so the remainder reads as the limit, not a series.
 */
const config = {
  tagged: { label: "Tagged", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function EpcCoverageChart({ assets }: { assets: Asset[] }) {
  const total = assets.length;
  const tagged = assets.filter(
    (asset) => asset.epc && asset.epc.isActive !== false && asset.epc.status === "ACTIVE"
  ).length;
  const percent = total === 0 ? 0 : Math.round((tagged / total) * 100);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>RFID Coverage</CardTitle>
        <CardDescription>Assets carrying an active RFID tag</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-center">
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No assets to measure.</p>
        ) : (
          <div className="relative">
            <ChartContainer config={config} className="mx-auto aspect-square h-56">
              {/* The arc spans the full circle; the value maps to the ANGLE axis, so
                  the sweep is the measure and the track behind it is the limit. */}
              <RadialBarChart
                data={[{ tagged: percent }]}
                startAngle={90}
                endAngle={-270}
                innerRadius={80}
                outerRadius={110}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
                <RadialBar
                  dataKey="tagged"
                  cornerRadius={999}
                  fill="var(--color-tagged)"
                  // The unfilled remainder is the track, drawn one step off the surface.
                  background={{ fill: "var(--muted)" }}
                />
              </RadialBarChart>
            </ChartContainer>

            {/* The value belongs in the middle of the meter, in text ink rather than
                the series colour. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-semibold">{percent}%</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {tagged} of {total} tagged
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
