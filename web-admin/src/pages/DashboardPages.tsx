import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getAssetsApi, type Asset } from "../api/assets.api";
import { getAssetMovementsApi, type AssetMovement } from "../api/assetMovements.api";
import { useAuthStore } from "../stores/authStores";
import { errorMessage } from "../utils/errorMessage";
import { AssetsByCategoryChart } from "@/components/dashboard/AssetsByCategoryChart";
import { EpcCoverageChart } from "@/components/dashboard/EpcCoverageChart";
import { AssetsByStatusChart } from "@/components/dashboard/AssetsByStatusChart";
import { MovementsByTypeChart } from "@/components/dashboard/MovementsByTypeChart";
import { MovementsTrendChart } from "@/components/dashboard/MovementsTrendChart";
import { ErrorBox } from "@/components/common/ErrorBox";
import { PageHeader } from "@/components/common/PageHeader";
import { SelectField } from "@/components/common/SelectField";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ranges stay at 90 days or less so the trend chart keeps one point per day;
 * a year of daily points would be an unreadable comb.
 */
const RANGES = [
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
];

const shortcuts = [
    { title: "Locations", description: "Manage stores, racks, and bins", path: "/locations" },
    { title: "Assets", description: "Register and track company assets", path: "/assets" },
    { title: "Issue Batches", description: "Prepare and issue assets to staff", path: "/issue-batches" },
    { title: "Stock Takes", description: "Run and review location stock takes", path: "/stock-takes" },
];

/** A single current value belongs in a stat tile, not a one-bar chart. */
function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
    return (
        <Card className="gap-2 py-5">
            <CardHeader>
                <CardDescription>{label}</CardDescription>
                <div className="text-3xl font-semibold">{value}</div>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </CardHeader>
        </Card>
    );
}

export function DashboardPage() {
    const user = useAuthStore((state) => state.user);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [movements, setMovements] = useState<AssetMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [range, setRange] = useState("30");
    const [category, setCategory] = useState("");

    useEffect(() => {
        // Fetched once here and passed down, so four charts do not make four calls.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void Promise.all([getAssetsApi(), getAssetMovementsApi()])
            .then(([loadedAssets, loadedMovements]) => {
                setAssets(loadedAssets);
                setMovements(Array.isArray(loadedMovements) ? loadedMovements : []);
            })
            .catch((caught) => setError(errorMessage(caught, "Failed to load dashboard data.")))
            .finally(() => setLoading(false));
    }, []);

    // Category scopes everything; the range scopes the activity charts, which are
    // the only time-based content (asset counts are a current snapshot, so dating
    // them by registration would answer a different question).
    const categoryOf = new Map(assets.map((asset) => [asset.id, String(asset.categoryId)]));
    const visibleAssets = category
        ? assets.filter((asset) => String(asset.categoryId) === category)
        : assets;
    const inRange = (movement: AssetMovement) => {
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - (Number(range) - 1));
        return new Date(movement.movementDate).getTime() >= cutoff.getTime();
    };
    const visibleMovements = movements
        .filter(inRange)
        .filter((movement) => !category || categoryOf.get(movement.assetId) === category);

    const categoryOptions = [...new Map(
        assets
            .filter((asset) => asset.category)
            .map((asset) => [String(asset.categoryId), asset.category!.name] as const)
    )].map(([value, label]) => ({ value, label }));

    const countByStatus = (status: string) => visibleAssets.filter((asset) => asset.status === status).length;

    return (
        <>
            <PageHeader
                title="Dashboard"
                description={`Welcome back, ${user?.fullName || user?.username || "Admin"}.`}
            />

            <ErrorBox message={error} />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {shortcuts.map((shortcut) => (
                    <Link key={shortcut.path} to={shortcut.path} className="group">
                        <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between gap-2 text-base">
                                    {shortcut.title}
                                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                </CardTitle>
                                <CardDescription>{shortcut.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* One filter row, above everything it scopes, so the tiles and all four
                charts always describe the same slice. */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="w-44 space-y-2">
                    <Label htmlFor="dashboard-range">Activity range</Label>
                    <SelectField
                        id="dashboard-range"
                        value={range}
                        onChange={setRange}
                        options={RANGES}
                    />
                </div>
                <div className="w-56 space-y-2">
                    <Label htmlFor="dashboard-category">Category</Label>
                    <SelectField
                        id="dashboard-category"
                        value={category}
                        onChange={setCategory}
                        options={categoryOptions}
                        emptyLabel="All categories"
                        placeholder="All categories"
                    />
                </div>
                {(category || range !== "30") && (
                    <Button
                        variant="ghost"
                        onClick={() => { setCategory(""); setRange("30"); }}
                    >
                        Reset
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-28 w-full" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatTile label="Total Assets" value={visibleAssets.length} hint={category ? "In selected category" : "Registered in the system"} />
                    <StatTile label="Available" value={countByStatus("AVAILABLE")} hint="Ready to issue" />
                    <StatTile label="In Use" value={countByStatus("IN_USE")} hint="Issued and confirmed" />
                    <StatTile label="Under Repair" value={countByStatus("UNDER_REPAIR")} hint="Out of service" />
                </div>
            )}

            {loading ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-96 w-full" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                    {/* The part-to-whole bar is wide; the meter is square. */}
                    <div className="lg:col-span-2">
                        <AssetsByStatusChart assets={visibleAssets} />
                    </div>
                    <EpcCoverageChart assets={visibleAssets} />
                    <div className="lg:col-span-2">
                        <MovementsTrendChart movements={visibleMovements} days={Number(range)} />
                    </div>
                    <MovementsByTypeChart movements={visibleMovements} days={Number(range)} />
                    <div className="lg:col-span-3">
                        <AssetsByCategoryChart assets={visibleAssets} />
                    </div>
                </div>
            )}
        </>
    );
}
