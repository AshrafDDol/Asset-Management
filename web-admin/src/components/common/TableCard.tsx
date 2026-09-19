import { Children, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/common/TablePagination";

type TableCardProps = {
  columns: ReactNode[];
  loading?: boolean;
  /** Rendered when there are no rows to show. */
  emptyMessage: string;
  isEmpty: boolean;
  children: ReactNode;
  /** Noun used by the pagination summary, e.g. "asset". */
  itemLabel?: string;
  /** Set false for short, fixed-length tables that never need paging. */
  paginated?: boolean;
  initialPageSize?: number;
};

export function TableCard({
  columns,
  loading,
  emptyMessage,
  isEmpty,
  children,
  itemLabel = "row",
  paginated = true,
  initialPageSize = 10,
}: TableCardProps) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  // Rows arrive as already-rendered elements, so paging slices the children.
  const rows = Children.toArray(children);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamping during render keeps the view valid when filters shrink the result set,
  // without an effect that would flash a blank page first.
  const currentPage = Math.min(page, totalPages);
  const visibleRows =
    paginated && !loading ? rows.slice((currentPage - 1) * pageSize, currentPage * pageSize) : rows;

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column, index) => (
                  <TableHead key={index} className="whitespace-nowrap">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {columns.map((_, columnIndex) => (
                      <TableCell key={columnIndex}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isEmpty ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows
              )}
            </TableBody>
          </Table>
        </div>

        {paginated && !loading && !isEmpty && (
          <TablePagination
            page={currentPage}
            pageSize={pageSize}
            total={total}
            itemLabel={itemLabel}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
