import { useState } from "react";
import { Columns3, GripVertical } from "lucide-react";
import { ASSET_COLUMN_OPTIONS, DEFAULT_ASSET_COLUMNS, normalizeAssetColumns, type AssetColumnId } from "../utils/assetColumns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

type AssetColumnSelectorProps = {
  columns: AssetColumnId[];
  apply: (columns: AssetColumnId[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AssetColumnSelector({ columns, apply, open, onOpenChange }: AssetColumnSelectorProps) {
  const [draft, setDraft] = useState(columns);
  const [dragging, setDragging] = useState<AssetColumnId | null>(null);

  const toggle = (id: AssetColumnId) =>
    setDraft((current) =>
      current.includes(id)
        ? current.filter((column) => column !== id)
        : [...current.filter((column) => column !== "action"), id, ...(id === "action" ? [] : ["action" as AssetColumnId])]
    );

  const optionsById = new Map(ASSET_COLUMN_OPTIONS.map((option) => [option.id, option]));
  const orderedOptions = [
    ...draft.map((id) => optionsById.get(id)!),
    ...ASSET_COLUMN_OPTIONS.filter((option) => !draft.includes(option.id)),
  ];

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

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Reopening always starts from the columns currently applied.
        if (next) setDraft(columns);
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Columns3 />
          Select Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="space-y-1 p-4 pb-3">
          <h4 className="text-sm font-semibold">Select Columns to Display</h4>
          <p className="text-xs text-muted-foreground">Drag the handle to reorder visible columns.</p>
        </div>

        <div className="flex gap-2 px-4 pb-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft(["assetCode", "action"])}>
            Deselect All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft(DEFAULT_ASSET_COLUMNS)}>
            Reset Default
          </Button>
        </div>

        <Separator />

        <div className="max-h-72 overflow-y-auto p-2">
          {orderedOptions.map((option) => {
            const visible = draft.includes(option.id);
            const draggable = visible && !option.required;

            return (
              <div
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${dragging === option.id ? "opacity-50" : ""} ${dragging && visible && dragging !== option.id ? "bg-accent" : ""}`}
                key={option.id}
                onDragEnter={() => reorderDraft(option.id)}
                onDragOver={(event) => {
                  if (visible) event.preventDefault();
                }}
              >
                <span
                  className={draggable ? "cursor-grab text-muted-foreground" : "cursor-not-allowed text-muted-foreground/40"}
                  draggable={draggable}
                  onDragStart={(event) => {
                    if (!draggable) return;
                    setDragging(option.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", option.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  aria-label={draggable ? `Drag to reorder ${option.label}` : undefined}
                  role={draggable ? "button" : undefined}
                  tabIndex={draggable ? 0 : undefined}
                  title={draggable ? `Drag to reorder ${option.label}` : "Position locked"}
                >
                  <GripVertical className="size-4" />
                </span>
                <Checkbox
                  id={`column-${option.id}`}
                  checked={visible}
                  disabled={option.required}
                  onCheckedChange={() => toggle(option.id)}
                />
                <label htmlFor={`column-${option.id}`} className="flex-1 cursor-pointer text-sm">
                  {option.label}
                  {option.required && <span className="ml-1 text-xs text-muted-foreground">(locked)</span>}
                </label>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex justify-end gap-2 p-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => apply(normalizeAssetColumns(draft))}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
