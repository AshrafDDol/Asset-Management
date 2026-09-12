import { useState } from "react";
import { ASSET_COLUMN_OPTIONS, DEFAULT_ASSET_COLUMNS, normalizeAssetColumns, type AssetColumnId } from "../utils/assetColumns";

export function AssetColumnSelector({ columns, close, apply }: { columns: AssetColumnId[]; close: () => void; apply: (columns: AssetColumnId[]) => void }) {
  const [draft, setDraft] = useState(columns);
  const [dragging, setDragging] = useState<AssetColumnId | null>(null);
  const toggle = (id: AssetColumnId) => setDraft((current) => current.includes(id) ? current.filter((column) => column !== id) : [...current.filter((column) => column !== "action"), id, ...(id === "action" ? [] : ["action" as AssetColumnId])]);
  const optionsById = new Map(ASSET_COLUMN_OPTIONS.map((option) => [option.id, option]));
  const orderedOptions = [...draft.map((id) => optionsById.get(id)!), ...ASSET_COLUMN_OPTIONS.filter((option) => !draft.includes(option.id))];
  const reorderDraft = (target: AssetColumnId) => {
    if (!dragging || dragging === target || dragging === "assetCode" || dragging === "action") return;
    setDraft((current) => {
      if (!current.includes(target)) return current;
      const sourceIndex = current.indexOf(dragging);
      const originalTargetIndex = current.indexOf(target);
      const movable = current.filter((id) => id !== "assetCode" && id !== "action" && id !== dragging);
      const targetIndex = target === "assetCode" ? 0 : target === "action" ? movable.length : movable.indexOf(target) + (sourceIndex < originalTargetIndex ? 1 : 0);
      movable.splice(targetIndex < 0 ? movable.length : targetIndex, 0, dragging);
      return ["assetCode", ...movable, "action"];
    });
  };
  return <div className="column-selector-popover" role="dialog" aria-label="Select Columns to Display"><h4>Select Columns to Display</h4><div className="column-selector-actions"><button type="button" className="table-button" onClick={() => setDraft(["assetCode", "action"])}>Deselect All</button><button type="button" className="table-button" onClick={() => setDraft(DEFAULT_ASSET_COLUMNS)}>Reset Default</button></div><div className="column-selector-list">{orderedOptions.map((option) => { const visible = draft.includes(option.id); const draggable = visible && !option.required; return <div className={`column-selector-row${dragging === option.id ? " is-dragging" : ""}${dragging && visible && dragging !== option.id ? " is-drop-target" : ""}`} key={option.id} onDragEnter={() => reorderDraft(option.id)} onDragOver={(event) => { if (visible) event.preventDefault(); }}><span className={`column-drag-handle${draggable ? "" : " is-locked"}`} draggable={draggable} onDragStart={(event) => { if (!draggable) return; setDragging(option.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", option.id); }} onDragEnd={() => setDragging(null)} aria-label={draggable ? `Drag to reorder ${option.label}` : undefined} role={draggable ? "button" : undefined} tabIndex={draggable ? 0 : undefined} title={draggable ? `Drag to reorder ${option.label}` : "Position locked"}>☰</span><input type="checkbox" checked={visible} disabled={option.required} onChange={() => toggle(option.id)} /><span>{option.label}{option.required ? " (locked)" : ""}</span></div>; })}</div><div className="form-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={() => apply(normalizeAssetColumns(draft))}>Apply</button></div></div>;
}
