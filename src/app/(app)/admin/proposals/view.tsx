"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CopyCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterSelect } from "@/components/filter-select";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePageParam } from "@/hooks/use-page-param";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { JobAccepted, ProposalPage } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { humanize, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { originLabel } from "@/lib/vendors";

const STATUSES = ["pending_review", "needs_info", "approved", "partially_approved", "auto_approved", "rejected"];
const KINDS = ["new_vendor", "update_vendor", "merge_vendors"];
const ORIGINS = ["manual", "excel", "pdf", "ai_vendor_discovery", "ai_equipment_discovery", "dedup_scan", "suggestion"];
const options = (values: string[], label = humanize) => values.map((value) => ({ value, label: label(value) }));
const OPEN = new Set(["pending_review", "needs_info"]);
const MAX_BULK = 100;
const PAGE_SIZE = 50;
const DEFAULT_STATUS = "pending_review";
// Each request must finish well within the proxy's 120 s limit even on a slow database link, so a request carries a
// few proposals, or fewer when they have many items (a products proposal can have 20+).
const CHUNK_PROPOSALS = 4;
const CHUNK_ITEMS = 12;

function chunks<T extends { items: number }>(targets: T[]): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let items = 0;
  for (const t of targets) {
    if (current.length && (current.length >= CHUNK_PROPOSALS || items + t.items > CHUNK_ITEMS)) {
      out.push(current);
      current = [];
      items = 0;
    }
    current.push(t);
    items += t.items;
  }
  if (current.length) out.push(current);
  return out;
}

type BulkResult = components["schemas"]["BulkResult"];

export default function ProposalsQueuePage() {
  const canReview = useCan(P.KNOWLEDGE_APPROVE);
  // Filters and page live in the URL: /admin/proposals?status=approved&origin=excel&page=3 (no status: the queue).
  const params = useSearchParams();
  const pathname = usePathname();
  const statusParam = params.get("status") ?? DEFAULT_STATUS;
  const status = statusParam === "any" ? "" : statusParam;
  const kind = params.get("kind") ?? "";
  const origin = params.get("origin") ?? "";
  const [page, setPage] = usePageParam();
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Map<string, number>>(new Map()); // proposal id -> version seen
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [failures, setFailures] = useState<{ id: string; title: string; error: string; version: number }[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const scan = useMutation({
    mutationFn: () => api<JobAccepted>("/admin/dedup/scan", { method: "POST", body: { use_ai: true } }),
    onSuccess: (r) => {
      setScanning(false);
      toast.success("Duplicate scan started. Merge proposals appear here when it finishes.");
      router.push(`/jobs/${r.job_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const proposals = useQuery({
    queryKey: ["proposals", "queue", status, kind, origin, page],
    queryFn: ({ signal }) =>
      api<ProposalPage>("/admin/proposals", {
        query: { status: status || undefined, kind: kind || undefined, origin: origin || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
        signal,
      }),
    placeholderData: (previous) => previous,
    enabled: canReview,
  });
  // One URL update for a filter change (two would race): the new filter, back to the first page.
  const setFilter = (key: "status" | "kind" | "origin", value: string) => {
    const query = new URLSearchParams(window.location.search);
    const stored = key === "status" ? (value === DEFAULT_STATUS ? "" : value || "any") : value;
    if (stored) query.set(key, stored);
    else query.delete(key);
    query.delete("page");
    router.replace(query.toString() ? `${pathname}?${query}` : pathname, { scroll: false });
    setSelected(new Map());
  };
  // Approving the last proposals of the last page: step back to the new last page.
  const total = proposals.data?.total ?? null;
  const lastPage = total === null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    if (lastPage !== null && !proposals.isFetching && page > lastPage) setPage(lastPage);
  }, [lastPage, page, proposals.isFetching, setPage]);
  const bulk = useMutation({
    mutationFn: async (action: "approve" | "reject"): Promise<BulkResult> => {
      const pendingItems = new Map(rows.map((p) => [p.id, Math.max(1, p.counts.pending)]));
      const targets = [...selected].map(([id, version]) => ({ id, version, items: pendingItems.get(id) ?? 1 }));
      const all: BulkResult = { done: 0, failed: 0, results: [] };
      setProgress({ done: 0, total: targets.length });
      try {
        for (const batch of chunks(targets)) {
          const r = await api<BulkResult>("/admin/proposals/bulk", {
            method: "POST",
            body: {
              action,
              note: action === "reject" ? note.trim() : "Approved in bulk",
              proposals: batch.map(({ id, version }) => ({ id, version })),
            },
          });
          all.done += r.done;
          all.failed += r.failed;
          all.results.push(...r.results);
          setProgress({ done: all.results.length, total: targets.length });
        }
      } catch (e) {
        // Keep what already went through; the rest stays selected for another try.
        const finished = new Set(all.results.map((r) => r.id));
        setSelected((prev) => new Map([...prev].filter(([id]) => !finished.has(id))));
        void queryClient.invalidateQueries({ queryKey: ["proposals"] });
        throw e;
      } finally {
        setProgress(null);
      }
      return all;
    },
    onSuccess: (r, action) => {
      const titles = new Map(rows.map((p) => [p.id, p.title]));
      setFailures(
        r.results
          .filter((x) => !x.ok)
          .map((x) => ({ id: x.id, title: titles.get(x.id) ?? x.id, error: x.error ?? "Failed", version: selected.get(x.id) ?? 0 })),
      );
      setSelected(new Map());
      setRejecting(false);
      setNote("");
      if (r.done) toast.success(`${r.done} proposal${r.done === 1 ? "" : "s"} ${action === "approve" ? "approved" : "rejected"}`);
      if (r.failed) toast.error(`${r.failed} couldn't be ${action === "approve" ? "approved" : "rejected"}; see the list above the table`);
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["data-quality"] });
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Websites another vendor already owns (group companies on the parent's site): save them all as group websites,
  // or reject them, in one go.
  const clashes = failures.filter((f) => f.error.includes("already belongs to"));
  const resolve = useMutation({
    mutationFn: async (mode: "shared" | "reject"): Promise<BulkResult> => {
      const all: BulkResult = { done: 0, failed: 0, results: [] };
      for (const batch of chunks(clashes.map((c) => ({ ...c, items: 1 })))) {
        const r = await api<BulkResult>("/admin/proposals/bulk", {
          method: "POST",
          body:
            mode === "shared"
              ? { action: "approve", note: "Saved as group websites in bulk", shared_websites: true, proposals: batch.map(({ id, version }) => ({ id, version })) }
              : { action: "reject", note: "The website belongs to another vendor", proposals: batch.map(({ id, version }) => ({ id, version })) },
        });
        all.done += r.done;
        all.failed += r.failed;
        all.results.push(...r.results);
      }
      return all;
    },
    onSuccess: (r, mode) => {
      const left = new Map(r.results.filter((x) => !x.ok).map((x) => [x.id, x.error ?? "Failed"]));
      setFailures((prev) => prev.filter((f) => !clashes.some((c) => c.id === f.id) || left.has(f.id)).map((f) => (left.has(f.id) ? { ...f, error: left.get(f.id)! } : f)));
      if (r.done) toast.success(`${r.done} website${r.done === 1 ? "" : "s"} ${mode === "shared" ? "saved as group websites" : "rejected"}`);
      if (r.failed) toast.error(`${r.failed} couldn't be changed; see the list`);
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
      void queryClient.invalidateQueries({ queryKey: ["data-quality"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canReview) return <NoAccess what="the approvals queue" />;
  const rows = proposals.data?.items ?? [];
  const open = rows.filter((p) => OPEN.has(p.status)).slice(0, MAX_BULK);
  const allPicked = open.length > 0 && open.every((p) => selected.has(p.id));
  const toggle = (id: string, version: number, on: boolean) => {
    if (on && selected.size >= MAX_BULK) {
      toast.error(`Up to ${MAX_BULK} proposals at a time`);
      return;
    }
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(id, version);
      else next.delete(id);
      return next;
    });
  };
  const n = selected.size;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Proposed vendors and facts from imports, documents and AI discovery. Nothing enters the shared knowledge base until it's approved here."
        actions={
          <Button variant="outline" onClick={() => setScanning(true)}>
            <CopyCheck /> Find duplicates
          </Button>
        }
      />
      <ConfirmDialog
        open={scanning}
        onOpenChange={setScanning}
        title="Scan for duplicate vendors?"
        description="Compares vendor names across the knowledge base. Near-identical names become merge proposals; similar ones are checked by the AI first (a few cents per pair, up to 200 pairs). Nothing is merged until you approve it."
        confirmLabel="Start scan"
        pending={scan.isPending}
        onConfirm={() => scan.mutate()}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterSelect label="Status" anyLabel="Any status" value={status} onChange={(v) => setFilter("status", v)} options={options(STATUSES)} />
        <FilterSelect label="Kind" anyLabel="New and updates" value={kind} onChange={(v) => setFilter("kind", v)} options={options(KINDS)} />
        <FilterSelect
          label="Source"
          anyLabel="Any source"
          value={origin}
          onChange={(v) => setFilter("origin", v)}
          options={options(ORIGINS, originLabel)}
        />
      </div>
      {failures.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">{failures.length} proposal(s) were left as they were:</span>
              <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => setFailures([])}>
                <X />
              </Button>
            </div>
            {clashes.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-background/60 p-2 text-foreground">
                <span className="text-sm">
                  {clashes.length} website{clashes.length === 1 ? " is" : "s are"} already used by another vendor, usually group companies sharing the parent&apos;s site.
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate("shared")}>
                    Save {clashes.length} as group websites
                  </Button>
                  <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate("reject")}>
                    Reject {clashes.length}
                  </Button>
                </div>
              </div>
            )}
            <ul className="grid gap-1">
              {failures.map((f) => (
                <li key={f.id}>
                  <Link href={`/admin/proposals/${f.id}`} className="font-medium underline">
                    {f.title}
                  </Link>
                  : {f.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {open.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2">
          <span className="text-sm text-muted-foreground">
            {n ? `${n} selected` : "Tick proposals to approve or reject them together. Each one is applied on its own; any that can't be are listed."}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" disabled={!n || bulk.isPending} onClick={() => bulk.mutate("approve")}>
              <Check />{" "}
              {bulk.isPending && bulk.variables === "approve"
                ? `Approving ${progress ? `${progress.done} of ${progress.total}` : ""}…`
                : `Approve${n ? ` (${n})` : ""}`}
            </Button>
            <Button size="sm" variant="outline" disabled={!n || bulk.isPending} onClick={() => setRejecting(true)}>
              <X /> Reject{n ? ` (${n})` : ""}
            </Button>
          </div>
        </div>
      )}
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {n} proposal{n === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>Every pending item in them is rejected. The reason is saved with each proposal and shown to whoever submitted it.</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Reason" placeholder="e.g. Parent group's website, not the vendor's own" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!note.trim() || bulk.isPending} onClick={() => bulk.mutate("reject")}>
              {bulk.isPending ? `Rejecting ${progress ? `${progress.done} of ${progress.total}` : ""}…` : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {proposals.isError && <p className="mb-3 text-sm text-destructive">{errorMessage(proposals.error)}</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select the open proposals shown"
                  checked={allPicked}
                  indeterminate={n > 0 && !allPicked}
                  disabled={!open.length}
                  onCheckedChange={(c) => setSelected(c ? new Map(open.map((p) => [p.id, p.version])) : new Map())}
                />
              </TableHead>
              <TableHead>Proposal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Pending / applied / rejected</TableHead>
              <TableHead>Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposals.isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {!proposals.isPending && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center whitespace-normal text-muted-foreground">
                  Nothing here. {status === "pending_review" && "The queue is clear."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
                <TableCell>
                  {OPEN.has(p.status) && (
                    <Checkbox
                      aria-label={`Select ${p.title}`}
                      checked={selected.has(p.id)}
                      onCheckedChange={(c) => toggle(p.id, p.version, Boolean(c))}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/admin/proposals/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">{humanize(p.kind)}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-sm">{originLabel(p.origin)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {p.counts.pending} / {p.counts.applied} / {p.counts.rejected}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{timeAgo(p.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4">
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          loading={proposals.isFetching}
          onPage={(p) => {
            setPage(p);
            setSelected(new Map());
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    </>
  );
}
