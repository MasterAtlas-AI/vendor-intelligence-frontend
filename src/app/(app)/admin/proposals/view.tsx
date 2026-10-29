"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { CopyCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";

import { FilterSelect } from "@/components/filter-select";
import { LoadMore } from "@/components/load-more";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { JobAccepted, ProposalPage } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { humanize, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { originLabel } from "@/lib/vendors";

const STATUSES = ["pending_review", "needs_info", "approved", "partially_approved", "auto_approved", "rejected"];
const KINDS = ["new_vendor", "update_vendor", "merge_vendors"];
const ORIGINS = ["manual", "excel", "pdf", "ai_vendor_discovery", "ai_equipment_discovery", "dedup_scan", "suggestion"];
const options = (values: string[], label = humanize) => values.map((value) => ({ value, label: label(value) }));

export default function ProposalsQueuePage() {
  const canReview = useCan(P.KNOWLEDGE_APPROVE);
  const [status, setStatus] = useState("pending_review");
  const [kind, setKind] = useState("");
  const [origin, setOrigin] = useState("");
  const [scanning, setScanning] = useState(false);
  const router = useRouter();
  const scan = useMutation({
    mutationFn: () => api<JobAccepted>("/admin/dedup/scan", { method: "POST", body: { use_ai: true } }),
    onSuccess: (r) => {
      setScanning(false);
      toast.success("Duplicate scan started. Merge proposals appear here when it finishes.");
      router.push(`/jobs/${r.job_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const proposals = useInfiniteQuery({
    queryKey: ["proposals", "queue", status, kind, origin],
    queryFn: ({ pageParam, signal }) =>
      api<ProposalPage>("/admin/proposals", { query: { status, kind, origin, limit: 25, cursor: pageParam }, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: canReview,
  });
  if (!canReview) return <NoAccess what="the approvals queue" />;
  const rows = proposals.data?.pages.flatMap((p) => p.items) ?? [];

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
        <FilterSelect label="Status" anyLabel="Any status" value={status} onChange={setStatus} options={options(STATUSES)} />
        <FilterSelect label="Kind" anyLabel="New and updates" value={kind} onChange={setKind} options={options(KINDS)} />
        <FilterSelect label="Source" anyLabel="Any source" value={origin} onChange={setOrigin} options={options(ORIGINS, originLabel)} />
      </div>
      {proposals.isError && <p className="mb-3 text-sm text-destructive">{errorMessage(proposals.error)}</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {!proposals.isPending && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center whitespace-normal text-muted-foreground">
                  Nothing here. {status === "pending_review" && "The queue is clear."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
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
      <LoadMore hasNextPage={proposals.hasNextPage} isFetchingNextPage={proposals.isFetchingNextPage} fetchNextPage={proposals.fetchNextPage} />
    </>
  );
}
