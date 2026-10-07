import ExcelJS from "exceljs";
import type { AssetCategory } from "../api/assetCategories.api";
import type { AssetImportRow } from "../api/assets.api";
import type { Location } from "../api/locations.api";

type ImportField = keyof Omit<AssetImportRow, "sourceRow">;
const ASSET_IMPORT_COLUMNS: Array<{ header: string; field: ImportField; identity?: boolean }> = [
  { header: "Asset Code", field: "assetCode", identity: true },
  { header: "EPC", field: "epc", identity: true },
  { header: "Item Name", field: "itemName" },
  { header: "Measurement Height (mm)", field: "measurementHeight" },
  { header: "Measurement Width (mm)", field: "measurementWidth" },
  { header: "Grid / Up", field: "gridUp" },
  { header: "Radius", field: "radius" },
  { header: "Gap (mm)", field: "gapMm" },
  { header: "Category Code", field: "categoryCode", identity: true },
  { header: "Storage Location Code", field: "storageLocationCode", identity: true },
  { header: "Serial Number", field: "serialNumber", identity: true },
  { header: "Brand", field: "brand" },
  { header: "Model", field: "model" },
  { header: "Purchase Date", field: "purchaseDate" },
  { header: "Purchase Cost", field: "purchaseCost" },
  { header: "Condition", field: "condition" },
  { header: "Auto Generate EPC", field: "autoGenerateEpc" },
  { header: "Remarks", field: "remarks" },
];
export const ASSET_IMPORT_HEADERS = ASSET_IMPORT_COLUMNS.map(column => column.header);

function download(buffer: ExcelJS.Buffer) { const blob = new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "Asset-Import-Template.xlsx"; anchor.click(); URL.revokeObjectURL(href); }

export async function downloadAssetImportTemplate(categories: AssetCategory[], locations: Location[]) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "IMS";
  const assets = workbook.addWorksheet("Assets", { views: [{ state: "frozen", ySplit: 1 }] });
  assets.addRow([...ASSET_IMPORT_HEADERS]); assets.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; assets.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; assets.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  assets.columns = ASSET_IMPORT_COLUMNS.map(column => ({ header: column.header, key: column.field, width: Math.max(15, Math.min(30, column.header.length + 4)), style: column.identity ? { numFmt: "@" } : undefined }));
  const conditionColumn = assets.getColumn("condition").letter;
  const autoGenerateColumn = assets.getColumn("autoGenerateEpc").letter;
  for (let row = 2; row <= 501; row += 1) {
    assets.getCell(`${conditionColumn}${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"GOOD,FAIR,POOR,DAMAGED"'] };
    assets.getCell(`${autoGenerateColumn}${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"YES,NO"'] };
  }
  const instructions = workbook.addWorksheet("Instructions"); instructions.columns = [{ width: 28 }, { width: 100 }]; instructions.addRows([["Rule", "Details"], ["Required fields", "Asset Code, Item Name, Category Code, and Storage Location Code."], ["Maximum rows", "500 asset rows per upload; file size must not exceed 5 MB."], ["Master data", "Category Code and Storage Location Code must already exist. The location must be an active STORAGE location. Do not edit reference sheets to create master data."], ["Uniqueness", "Asset Code must be unique. Serial Number and EPC must be unique when supplied."], ["EPC format", "EPC must contain hexadecimal characters only and have an even number of characters."], ["EPC behavior", "Supply EPC with Auto Generate EPC blank/NO; or leave EPC blank and use YES; or leave both blank/NO for no EPC. EPC plus YES is invalid."], ["Identity values", "Keep Asset Code, Category Code, Storage Location Code, Serial Number, and EPC as text to preserve leading zeros."], ["Purchase Date", "Use YYYY-MM-DD."], ["Import behavior", "Validation is authoritative on the server. The entire batch is imported or none of it is."]]); instructions.getRow(1).font = { bold: true };
  const categorySheet = workbook.addWorksheet("Categories", { views: [{ state: "frozen", ySplit: 1 }] }); categorySheet.addRow(["Category Code", "Category Name"]); categorySheet.getRow(1).font = { bold: true }; categories.filter(v => v.isActive !== false).forEach(v => categorySheet.addRow([v.categoryCode, v.name])); categorySheet.columns = [{ width: 24, style: { numFmt: "@" } }, { width: 40 }];
  const locationSheet = workbook.addWorksheet("Storage Locations", { views: [{ state: "frozen", ySplit: 1 }] }); locationSheet.addRow(["Location Code", "Location Name", "Full Path", "Type"]); locationSheet.getRow(1).font = { bold: true }; locations.filter(v => v.isActive !== false && v.locationType === "STORAGE").forEach(v => locationSheet.addRow([v.locationCode, v.name, (v.displayPath || v.name).replaceAll(" / ", " > "), v.locationType])); locationSheet.columns = [{ width: 30, style: { numFmt: "@" } }, { width: 35 }, { width: 60 }, { width: 15 }];
  download(await workbook.xlsx.writeBuffer());
}

function display(cell: ExcelJS.Cell) { const value = cell.value; if (value === null || value === undefined) return ""; if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; if (typeof value === "object") return ""; return String(value).trim(); }
export async function parseAssetImportWorkbook(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Select an XLSX workbook."); if (file.size > 5 * 1024 * 1024) throw new Error("The XLSX file must not exceed 5 MB.");
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.getWorksheet("Assets"); if (!sheet) throw new Error('The workbook must contain an "Assets" sheet.');
  const headerPositions = new Map<string, number>();
  let populatedHeaderCount = 0;
  for (let column = 1; column <= sheet.getRow(1).cellCount; column += 1) {
    const header = display(sheet.getCell(1, column));
    if (!header) continue;
    populatedHeaderCount += 1;
    if (headerPositions.has(header)) throw new Error(`The Assets sheet contains duplicate column "${header}".`);
    headerPositions.set(header, column);
  }
  if (populatedHeaderCount !== ASSET_IMPORT_COLUMNS.length || ASSET_IMPORT_COLUMNS.some(column => !headerPositions.has(column.header))) throw new Error("The Assets sheet columns do not match the template.");
  const rows: AssetImportRow[] = []; const clientErrors = new Map<number, string[]>();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const cells = ASSET_IMPORT_COLUMNS.map(column => ({ column, cell: sheet.getCell(rowNumber, headerPositions.get(column.header)!) })); if (cells.every(({ cell }) => cell.value === null || cell.value === undefined || display(cell) === "")) continue;
    const errors: string[] = []; const row: AssetImportRow = { sourceRow: rowNumber };
    cells.forEach(({ column, cell }) => { const value = cell.value; if (value && typeof value === "object" && "formula" in value) errors.push(`${column.header} cannot contain a formula.`); else if (column.identity && typeof value === "number") errors.push(`${column.header} must be stored as text.`); else (row as Record<string, unknown>)[column.field] = display(cell); });
    if (errors.length) clientErrors.set(rowNumber, errors); rows.push(row);
  }
  if (rows.length > 500) throw new Error("The workbook contains more than 500 asset rows."); if (!rows.length) throw new Error("The workbook contains no asset rows."); return { rows, clientErrors };
}
