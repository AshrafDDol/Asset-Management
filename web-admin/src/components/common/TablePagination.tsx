import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { SelectField } from "@/components/common/SelectField";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Page numbers to render, with `null` marking an ellipsis gap.
 * Always shows the first and last page plus a window around the current one.
 */
function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);
  if (current <= 3) [2, 3, 4].forEach((p) => p < total && pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => p > 1 && pages.add(p));

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push(null);
    result.push(page);
  });
  return result;
}

type TablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Noun for the row count, e.g. "asset". */
  itemLabel?: string;
};

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel = "row",
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // Links are in-page controls, so they suppress navigation rather than carrying an href.
  const go = (target: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    if (target >= 1 && target <= totalPages && target !== page) onPageChange(target);
  };
  const disabledProps = (isDisabled: boolean) =>
    isDisabled
      ? { "aria-disabled": true, tabIndex: -1, className: "pointer-events-none opacity-50" }
      : {};

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground tabular-nums">
          {total === 0
            ? `No ${itemLabel}s`
            : `${first}–${last} of ${total} ${itemLabel}${total === 1 ? "" : "s"}`}
        </p>
        <SelectField
          value={String(pageSize)}
          onChange={(value) => onPageSizeChange(Number(value))}
          options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} / page` }))}
          className="h-8 w-28"
        />
      </div>

      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" onClick={go(page - 1)} {...disabledProps(page <= 1)} />
            </PaginationItem>

            {pageWindow(page, totalPages).map((entry, index) =>
              entry === null ? (
                <PaginationItem key={`gap-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={entry}>
                  <PaginationLink href="#" isActive={entry === page} onClick={go(entry)}>
                    {entry}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            <PaginationItem>
              <PaginationNext href="#" onClick={go(page + 1)} {...disabledProps(page >= totalPages)} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
