import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type FilterCardProps = {
  children: ReactNode;
  onClear: () => void;
  title?: string;
  /** Optional status text shown beside the clear action, e.g. a result count. */
  summary?: ReactNode;
};

export function FilterCard({ children, onClear, title = "Search / Filters", summary }: FilterCardProps) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{title}</span>
          <div className="flex items-center gap-3">
            {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              Clear Filters
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
      </CardContent>
    </Card>
  );
}

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

/** Label + control pair used by both filter bars and modal forms. */
export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={className ? `space-y-2 ${className}` : "space-y-2"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
