import { Badge } from "@/components/ui/badge";

/** The API treats a missing isActive as active, so only an explicit false is inactive. */
export function StatusBadge({ isActive }: { isActive?: boolean }) {
  return isActive === false ? (
    <Badge variant="outline" className="text-muted-foreground">
      Inactive
    </Badge>
  ) : (
    <Badge variant="secondary">Active</Badge>
  );
}
