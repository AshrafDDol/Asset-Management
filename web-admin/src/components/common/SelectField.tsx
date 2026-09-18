import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * "No selection" is carried as a sentinel because an empty string is not a usable
 * command value. Page state still sees "" so filter logic is unchanged.
 */
const EMPTY = "__none__";

/** Lists at least this long get a search box; shorter ones would just be noise. */
const SEARCH_THRESHOLD = 8;

export type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Label for the "" option, e.g. "All roles". Omit to require a real choice. */
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Force the search box on or off instead of deciding by option count. */
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function SelectField({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder = "Select...",
  disabled,
  id,
  className,
  searchable,
  searchPlaceholder = "Search...",
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);

  const entries: SelectOption[] =
    emptyLabel !== undefined ? [{ value: EMPTY, label: emptyLabel }, ...options] : options;
  const selectedValue = value === "" ? EMPTY : value;
  const selected = entries.find((option) => option.value === selectedValue);
  const showSearch = searchable ?? entries.length >= SEARCH_THRESHOLD;

  const choose = (next: string) => {
    onChange(next === EMPTY ? "" : next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-slot="select-trigger"
          className={cn(
            "justify-between px-3 font-normal",
            !selected && "text-muted-foreground",
            className ?? "w-full"
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-52 p-0">
        {/* cmdk's default fuzzy score is too loose for codes — "Bin 2-1" would also
            surface "Bin 2-2". Plain substring matching on the label is predictable,
            and the id suffix is stripped so it never matches the typed text. */}
        <Command
          filter={(itemValue, search) => {
            const label = itemValue.split("⁣")[0];
            return label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          {showSearch && <CommandInput placeholder={searchPlaceholder} className="h-9" />}
          <CommandList>
            <CommandEmpty>No match found.</CommandEmpty>
            <CommandGroup>
              {entries.map((option) => (
                <CommandItem
                  key={option.value}
                  // cmdk both filters and identifies items by this string, so it carries
                  // the label (what people type) plus the id (labels are not unique —
                  // e.g. several racks each hold a "Bin 2-1").
                  value={`${option.label} ⁣${option.value}`}
                  onSelect={() => choose(option.value)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      option.value === selectedValue ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const STATUS_OPTIONS: SelectOption[] = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export const ORDER_OPTIONS: SelectOption[] = [
  { value: "LATEST", label: "Latest" },
  { value: "OLDEST", label: "Oldest" },
];
