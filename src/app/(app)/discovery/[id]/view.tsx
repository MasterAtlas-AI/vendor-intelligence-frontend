"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Radio, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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
import { api } from "@/lib/api/client";
import type { ImportRowOutcome, ImportRowPage, ImportRowRead, JobRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { jobTitle } from "@/lib/discovery";
import { formatDateTime, humanize } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

const DISCOVERY_OUTCOMES: Partial<Record<ImportRowOutcome, string>> = {
  proposed: "New vendors",
  matched: "Known vendors",
  already_proposed: "Already under review",
  ambiguous: "Unclear",
  discarded: "Discarded",
};

const STAGES: Record<string, string> = {
  planning: "Planning searches",
  searching: "Searching the web",
  matching: "Checking against the knowledge base",
  crawling: "Reading the vendor's website",
  researching: "Reading supplier websites",
  extracting: "Extracting facts",
  classifying: "Classifying",
  proposing: "Sending for review",
};

function Found({ row }: { row: ImportRowRead }) {
  const d = (row.details ?? {}) as Record<string, unknown>;
  const highlights = (d.highlights ?? {}) as Record<string, string[]>;
  const facts = (d.facts ?? {}) as Record<string, number>;
  const groups = Object.entries(highlights).filter(([, v]) => v.length);
  if (!groups.length && !facts.unsupported) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="grid gap-1 text-xs">
      {groups.map(([kind, names]) => (
        <div key={kind}>
          <span className="text-muted-foreground">{humanize(kind)}: </span>
          {names.join(", ")}
        </div>
      ))}
      {facts.unsupported ? (
        <div className="text-muted-foreground">{facts.unsupported} unproven claim{facts.unsupported === 1 ? "" : "s"} dropped</div>
      ) : null}
    </div>
  );
}

function VendorCell({ row }: { row: ImportRowRead }) {
  const d = (row.details ?? {}) as Record<string, unknown>;
  const website = typeof d.website === "string" ? d.website : null;
  const suspicious = Array.isArray(d.suspicious_pages) ? (d.suspicious_pages as string[]) : [];
  return (
    <div className="grid gap-0.5">
      <span className="font-medium">
        {row.vendor_id ? (
          <Link href={`/vendors/${row.vendor_id}`} className="hover:underline">
            {row.vendor_name}
          </Link>
        ) : (
          row.vendor_name
        )}
      </span>
      {website && (
        <a href={website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          {website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalLink className="size-3" />
        </a>
      )}
      {suspicious.length > 0 && (
        <span
          className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
          title={`Instruction-like text was removed from: ${suspicious.join(", ")}`}
        >
          <ShieldAlert className="size-3.5" /> Site tried to instruct the AI
        </span>
      )}
    </div>
  );
}

function Results({ jobId }: { jobId: string }) {
  const canReview = useCan(P.KNOWLEDGE_APPROVE);
  const [outcome, setOutcome] = useState<ImportRowOutcome | null>(null);
  const rows = useInfiniteQuery({
    queryKey: ["discovery-results", jobId, outcome],
    queryFn: ({ pageParam, signal }) =>
      api<ImportRowPage>(`/discovery/runs/${jobId}/results`, { query: { outcome, limit: 100, cursor: pageParam }, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const counts = rows.data?.pages[0]?.counts ?? {};
  const items = rows.data?.pages.flatMap((p) => p.items) ?? [];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by outcome">
          <Button size="sm" variant={outcome === null ? "default" : "outline"} onClick={() => setOutcome(null)}>
            All <span className="tabular-nums">{total}</span>
          </Button>
          {(Object.keys(DISCOVERY_OUTCOMES) as ImportRowOutcome[])
            .filter((o) => counts[o])
            .map((o) => (
              <Button key={o} size="sm" variant={outcome === o ? "default" : "outline"} onClick={() => setOutcome(o)}>
                {DISCOVERY_OUTCOMES[o]} <span className="tabular-nums">{counts[o]}</span>
              </Button>
            ))}
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Found (each with a quoted source)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.isPending && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {rows.isSuccess && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nothing to show.
                  </TableCell>
                </TableRow>
              )}
              {items.map((r) => {
                const d = (r.details ?? {}) as Record<string, unknown>;
                const notes = [...r.messages, typeof d.note === "string" ? d.note : "", r.outcome === "discarded" ? "" : String(d.why ?? "")]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="max-w-56 whitespace-normal">
                      <VendorCell row={r} />
                    </TableCell>
                    <TableCell className="grid gap-1">
                      <StatusBadge status={r.outcome} />
                      {r.proposal_id && canReview && (
                        <Link href={`/admin/proposals/${r.proposal_id}`} className="text-xs text-primary hover:underline">
                          Review proposal
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      <Found row={r} />
                    </TableCell>
                    <TableCell className="max-w-sm text-xs whitespace-normal text-muted-foreground">{notes || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <LoadMore hasNextPage={rows.hasNextPage} isFetchingNextPage={rows.isFetchingNextPage} fetchNextPage={rows.fetchNextPage} />
      </CardContent>
    </Card>
  );
}

function Summary({ job }: { job: JobRead }) {
  const r = (job.result ?? {}) as Record<string, unknown>;
  const badges: string[] =
    job.type === "vendor_discovery"
      ? [
          `${String(r.candidates ?? 0)} candidates`,
          `${String(r.researched ?? 0)} researched`,
          `${String(r.pages_read ?? 0)} pages read`,
        ]
      : [
          r.proposal_id ? "New facts sent for review" : "Nothing new to propose",
          ...(r.evidence_added_to_existing ? [`${String(r.evidence_added_to_existing)} known facts got new evidence`] : []),
          ...(r.conflicts ? [`${String(r.conflicts)} conflicts with what we know`] : []),
        ];
  badges.push(`cost $${Number(job.cost_usd).toFixed(2)}`);
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <Badge key={b} variant="secondary">
          {b}
        </Badge>
      ))}
      {Boolean(r.budget_ran_out) && <Badge variant="destructive">Stopped early: the AI budget ran out</Badge>}
      {Number(r.failed_queries ?? 0) > 0 && <Badge variant="secondary">{String(r.failed_queries)} searches failed</Badge>}
    </div>
  );
}

export default function DiscoveryRunPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ["job", id], queryFn: () => api<JobRead>(`/jobs/${id}`) });
  const finished = job.data ? TERMINAL_JOB_STATUSES.has(job.data.status) : false;
  const live = useLiveJob(id, Boolean(job.data) && !finished);

  useEffect(() => {
    if (finished) {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
    }
  }, [finished, queryClient]);

  if (job.isPending) return <Skeleton className="h-64" />;
  if (job.isError) return <p className="text-sm text-muted-foreground">{errorMessage(job.error)}</p>;
  const j = job.data;
  const vendorId = typeof j.input.vendor_id === "string" ? j.input.vendor_id : null;

  return (
    <>
      <Link href="/discovery" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> AI discovery
      </Link>
      <PageHeader
        title={jobTitle(j)}
        description={`${j.type === "vendor_discovery" ? "Vendor discovery" : "Vendor research"} · started ${formatDateTime(j.created_at)}`}
        actions={
          <>
            {vendorId && (
              <Button variant="outline" render={<Link href={`/vendors/${vendorId}`} />}>
                Open vendor
              </Button>
            )}
            <StatusBadge status={j.status} />
          </>
        }
      />
      <div className="grid gap-4">
        {!finished && (
          <Card>
            <CardContent className="grid gap-2">
              <ProgressBar
                value={j.progress}
                label={j.stage ? (STAGES[j.stage] ?? humanize(j.stage)) : j.status === "queued" ? "Waiting to start" : "Starting"}
              />
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {live && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Radio className="size-3.5 animate-pulse" /> Live
                  </span>
                )}
                <span>Cost so far ${Number(j.cost_usd).toFixed(2)}</span>
                <span>You can leave this page; the run continues in the background.</span>
              </div>
            </CardContent>
          </Card>
        )}
        {j.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive">The run failed</div>
            <div>{String(j.error.message ?? "")}</div>
          </div>
        )}
        {finished && j.status !== "failed" && <Summary job={j} />}
        {finished && j.status !== "failed" && <Results jobId={id} />}
      </div>
    </>
  );
}
