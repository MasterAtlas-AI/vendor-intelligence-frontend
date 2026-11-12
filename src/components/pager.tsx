"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Page numbers to show: the first, the last, and two either side of the current one, with gaps as null. */
function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/** "26–50 of 1,240" with Previous / numbered pages / Next. Renders nothing while the total is unknown, or when
 *  everything fits on one page. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  loading = false,
}: {
  page: number;
  pageSize: number;
  total: number | null | undefined; // unknown while loading: nothing shown
  onPage: (page: number) => void;
  loading?: boolean;
}) {
  if (total === null || total === undefined) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page <= 1) return null;
  const from = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + 1);
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
      <span className="text-muted-foreground tabular-nums">
        {page > pages ? `Page ${page} is past the end` : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(Math.min(page - 1, pages))}>
          <ChevronLeft /> Previous
        </Button>
        {pageList(Math.min(page, pages), pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              size="sm"
              variant={p === page ? "default" : "ghost"}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              disabled={loading && p !== page}
              onClick={() => onPage(p)}
              className="min-w-8 tabular-nums"
            >
              {p}
            </Button>
          ),
        )}
        <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => onPage(page + 1)}>
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
