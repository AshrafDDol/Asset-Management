export type AssetColumnId = "assetCode" | "itemName" | "category" | "measurement" | "bladeDetails" | "gridUp" | "radius" | "gapMm" | "epc" | "currentLocation" | "homeLocation" | "status" | "condition" | "brand" | "model" | "serialNumber" | "purchaseDate" | "purchaseCost" | "action";

export const ASSET_COLUMN_OPTIONS: Array<{ id: AssetColumnId; label: string; required?: boolean }> = [
  { id: "assetCode", label: "Asset Code", required: true }, { id: "itemName", label: "Item Name" }, { id: "category", label: "Category" }, { id: "measurement", label: "Measurement" }, { id: "bladeDetails", label: "Blade Details" }, { id: "epc", label: "EPC" }, { id: "currentLocation", label: "Current Location" }, { id: "status", label: "Status" }, { id: "condition", label: "Condition" }, { id: "gridUp", label: "Grid / Up" }, { id: "radius", label: "Radius" }, { id: "gapMm", label: "Gap" }, { id: "brand", label: "Brand" }, { id: "model", label: "Model" }, { id: "serialNumber", label: "Serial Number" }, { id: "purchaseDate", label: "Purchase Date" }, { id: "purchaseCost", label: "Purchase Cost" }, { id: "homeLocation", label: "Storage Location" }, { id: "action", label: "Action", required: true },
];

export const DEFAULT_ASSET_COLUMNS: AssetColumnId[] = ["assetCode", "itemName", "category", "measurement", "bladeDetails", "epc", "currentLocation", "status", "condition", "action"];
const validIds = new Set(ASSET_COLUMN_OPTIONS.map((option) => option.id));

export function normalizeAssetColumns(value: unknown): AssetColumnId[] {
  if (!Array.isArray(value)) return DEFAULT_ASSET_COLUMNS;
  const unique = value.filter((id): id is AssetColumnId => typeof id === "string" && validIds.has(id as AssetColumnId)).filter((id, index, values) => values.indexOf(id) === index);
  if (unique.length === 0) return DEFAULT_ASSET_COLUMNS;
  for (const required of ["assetCode", "action"] as AssetColumnId[]) if (!unique.includes(required)) unique.push(required);
  return unique;
}
