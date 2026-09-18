import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The API and all page state store dates as "yyyy-MM-dd" strings, so this picker
 * converts on the boundary only. Parsing is done from the parts rather than
 * `new Date(string)`, which would read the value as UTC and can shift the day.
 */
function toDate(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Inclusive bounds, as "yyyy-MM-dd". */
  min?: string;
  max?: string;
  /** Show a clear affordance when a date is set. */
  clearable?: boolean;
};

export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  placeholder = "Pick a date",
  min,
  max,
  clearable = true,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);

  // Only constrain the side that was actually given a bound.
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  // The dropdown caption needs an explicit range to populate its year list.
  const thisYear = new Date().getFullYear();
  const startMonth = new Date(minDate ? minDate.getFullYear() : thisYear - 30, 0);
  const endMonth = new Date(maxDate ? maxDate.getFullYear() : thisYear + 5, 11);

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start px-3 font-normal",
              !selected && "text-muted-foreground",
              clearable && selected && !disabled && "pr-9"
            )}
          >
            <CalendarIcon className="size-4 shrink-0 opacity-60" />
            {selected ? format(selected, "d MMM yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            autoFocus
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            disabled={disabledDays.length ? disabledDays : undefined}
            onSelect={(date) => {
              if (!date) return;
              onChange(toValue(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {clearable && selected && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
          aria-label="Clear date"
          onClick={() => onChange("")}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
