"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Radio } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LoadMore } from "@/components/load-more";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TERMINAL_JOB_STATUSES, useLiveJob } from "@/hooks/use-live-job";
import { api, download } from "@/lib/api/client";
import type { ImportRowOutcome, ImportRowPage, JobRead } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { formatDateTime, humanize } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { AVL_LABELS, OUTCOME_LABELS } from "@/lib/vendors";

function overlaySummary(overlay: Record<string, unknown>): string {
  const parts: string[] = [];
  if (overlay.avl_status) parts.push(AVL_LABELS[overlay.avl_status as keyof typeof AVL_LABELS] ?? String(overlay.avl_status));
  if (overlay.internal_vendor_code) parts.push(`code ${String(overlay.internal_vendor_code)}`);
  if (Array.isArray(overlay.tags) && overlay.tags.length) parts.push(overlay.tags.join(", "));
  return parts.join(" · ");
}

function ReportRows({ jobId, finished }: { jobId: string; finished: boolean }) {
  const [outcome, setOutcome] = useState<ImportRowOutcome | null>(null);
  const rows = useInfiniteQuery({
    queryKey: ["import-rows", jobId, outcome],
    queryFn: ({ pageParam, signal }) =>
      api<ImportRowPage>(`/imports/${jobId}/rows`, { query: { outcome, limit: 100, cursor: pageParam }, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: finished,
  });
  if (!finished) return null;
  const counts = rows.data?.pages[0]?.counts ?? {};
  const items = rows.data?.pages.flatMap((p) => p.items) ?? [];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Report</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => download(`/imports/${jobId}/report.csv`, `import-${jobId}.csv`).catch((e) => toast.error(errorMessage(e)))}
        >
          <Download /> Download CSV
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rows by outcome">
          <Button size="sm" variant={outcome === null ? "default" : "outline"} onClick={() => setOutcome(null)}>
            All <span className="tabular-nums">{total}</span>
          </Button>
          {(Object.keys(OUTCOME_LABELS) as ImportRowOutcome[])
            .filter((o) => counts[o])
            .map((o) => (
              <Button key={o} size="sm" variant={outcome === o ? "default" : "outline"} onClick={() => setOutcome(o)}>
                {OUTCOME_LABELS[o]} <span className="tabular-nums">{counts[o]}</span>
              </Button>
            ))}
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Row</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Your fields</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.isPending && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{r.row_number}</TableCell>
                  <TableCell className="font-medium">
                    {r.vendor_id ? (
                      <Link href={`/vendors/${r.vendor_id}`} className="hover:underline">
                        {r.vendor_name}
                      </Link>
                    ) : (
                      r.vendor_name || <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.outcome} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{overlaySummary(r.overlay)}</TableCell>
                  <TableCell className="max-w-md text-xs whitespace-normal text-muted-foreground">{r.messages.join(" · ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <LoadMore hasNextPage={rows.hasNextPage} isFetchingNextPage={rows.isFetchingNextPage} fetchNextPage={rows.fetchNextPage} />
      </CardContent>
    </Card>
  );
}

export default function ImportReportPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ["job", id], queryFn: () => api<JobRead>(`/jobs/${id}`) });
  const finished = job.data ? TERMINAL_JOB_STATUSES.has(job.data.status) : false;
  const live = useLiveJob(id, Boolean(job.data) && !finished);

  useEffect(() => {
    // The import just finished: the vendor lists and proposals changed.
    if (finished) {
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }
  }, [finished, queryClient]);

  if (job.isPending) return <Skeleton className="h-64" />;
  if (job.isError) return <p className="text-sm text-muted-foreground">{errorMessage(job.error)}</p>;
  const j = job.data;
  const result = (j.result ?? {}) as Record<string, unknown>;
  const isPdf = j.type === "pdf_import";

  return (
    <>
      <Link href="/imports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> Imports
      </Link>
      <PageHeader
        title={String(j.input.filename ?? humanize(j.type))}
        description={`${isPdf ? "PDF" : "Spreadsheet"} import · started ${formatDateTime(j.created_at)}`}
        actions={<StatusBadge status={j.status} />}
      />
      <div className="grid gap-4">
        {!finished && (
          <Card>
            <CardContent className="grid gap-2">
              <ProgressBar value={j.progress} label={j.stage ? humanize(j.stage) : j.status === "queued" ? "Waiting to start" : "Starting"} />
              {live && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Radio className="size-3.5 animate-pulse" /> Live
                </span>
              )}
            </CardContent>
          </Card>
        )}
        {j.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive">The import failed</div>
            <div>{String(j.error.message ?? "")}</div>
          </div>
        )}
        {finished && j.status === "succeeded" && (
          <div className={cn("flex flex-wrap gap-2 text-sm text-muted-foreground")}>
            {isPdf ? (
              <>
                <Badge variant="secondary">{String(result.facts_selected ?? 0)} facts proposed</Badge>
                <Badge variant="secondary">{String(result.pages_read ?? 0)} pages read</Badge>
              </>
            ) : (
              <>
                <Badge variant="secondary">{String(result.rows ?? 0)} rows</Badge>
                {Boolean(result.truncated) && (
                  <Badge variant="secondary">Only the first {String(result.max_rows)} rows were imported</Badge>
                )}
              </>
            )}
          </div>
        )}
        <ReportRows jobId={id} finished={finished && j.status === "succeeded"} />
      </div>
    </>
  );
}
