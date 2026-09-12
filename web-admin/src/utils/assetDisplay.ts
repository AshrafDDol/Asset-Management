import type { Asset } from "../api/assets.api";

const compactNumber = (value: string | number | null | undefined) => value == null || value === "" ? null : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const formatMeasurement = (asset: Pick<Asset, "measurementHeight" | "measurementWidth">) => asset.measurementHeight == null || asset.measurementWidth == null ? "—" : `${compactNumber(asset.measurementHeight)} × ${compactNumber(asset.measurementWidth)} mm`;
export const formatRadius = (value: Asset["radius"]) => { const formatted = compactNumber(value); return formatted == null ? null : `R${formatted}`; };
export const formatGap = (value: Asset["gapMm"]) => { const formatted = compactNumber(value); return formatted == null ? null : `Gap ${formatted} mm`; };
export const formatBladeDetails = (asset: Pick<Asset, "gridUp" | "radius" | "gapMm">) => [asset.gridUp == null ? null : `${asset.gridUp} UP`, formatRadius(asset.radius), formatGap(asset.gapMm)].filter(Boolean).join(" · ") || "—";
export const formatPurchaseDate = (value: Asset["purchaseDate"]) => value ? new Date(value).toLocaleDateString() : "—";
export const displayValue = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
