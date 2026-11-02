"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, PackageSearch, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TERMINAL_JOB_STATUSES, useLiveJob } from "@/hooks/use-live-job";
import { api } from "@/lib/api/client";
import type { DiscoveryAccepted, JobRead, ProposalDetail, ProposalItemRead, VendorDetail } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

type Depth = "standard" | "deep";

const DEPTHS: Record<Depth, { label: string; detail: string; usd: string }> = {
  standard: { label: "Standard", detail: "Up to 25 pages: product pages and the datasheets they link to.", usd: "under US$0.05" },
  deep: { label: "Deep", detail: "Up to 60 pages, one level deeper: for large catalogues with many models.", usd: "about US$0.05-0.15" },
};

interface ProductsResult {
  pages_read: number;
  products_found: number;
  products_kept: number;
  products_unsupported: number;
  products_unmapped: number;
  specs_kept: number;
  specs_unsupported: number;
  services_kept?: number;
  proposal_id: string | null;
  not_kept?: { name: string; model_series: string | null; category: string; specs: number; reason: string }[];
}

/** Products the AI found but that weren't proposed, with why (so nothing found disappears silently). */
function NotKept({ rows }: { rows: NonNullable<ProductsResult["not_kept"]> }) {
  if (!rows.length) return null;
  return (
    <details className="rounded-lg border p-3" open={rows.length <= 5}>
      <summary className="cursor-pointer text-sm font-medium">Not kept ({rows.length})</summary>
      <ul className="mt-2 divide-y text-sm">
        {rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className="grid gap-0.5 py-2">
            <span>
              {r.name}
              {r.model_series && <span className="text-muted-foreground"> · {r.model_series}</span>}
              <span className="text-muted-foreground"> · {r.category}</span>
              {r.specs > 0 && <span className="text-muted-foreground"> · {r.specs} values</span>}
            </span>
            <span className="text-xs text-muted-foreground">{r.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Header button: read the vendor's product pages and datasheets with AI for every product and its specifications. */
export function FullDetailsButton({ vendor, onStarted }: { vendor: VendorDetail; onStarted: (jobId: string) => void }) {
  const canRun = useCan(P.DISCOVERY_RUN);
  const [open, setOpen] = useState(false);
  const [depth, setDepth] = useState<Depth>("standard");
  const start = useMutation({
    mutationFn: () => api<DiscoveryAccepted>(`/discovery/vendors/${vendor.id}/products`, { method: "POST", body: { depth } }),
    onSuccess: (r) => {
      setOpen(false);
      onStarted(r.job_id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canRun || vendor.status === "retired") return null;
  const hasSite = Boolean(vendor.website || vendor.domains.length);

  return (
    <>
      <Button disabled={!hasSite} title={hasSite ? undefined : "Add a website for this vendor first"} onClick={() => setOpen(true)}>
        <PackageSearch /> Get full details with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Full product details</DialogTitle>
            <DialogDescription>
              The AI reads {vendor.domains[0] ?? "the vendor's website"} and lists every product line with its specifications (ranges,
              construction, materials, standards, applications). Each value must appear on the vendor&apos;s own pages; anything else is
              dropped. A curator approves the results.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2" role="radiogroup" aria-label="How much to read">
            {(Object.keys(DEPTHS) as Depth[]).map((d) => (
              <Label key={d} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal ${depth === d ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="depth" className="mt-1" checked={depth === d} onChange={() => setDepth(d)} />
                <span className="grid gap-0.5">
                  <span className="font-medium">
                    {DEPTHS[d].label} <span className="font-normal text-muted-foreground">· {DEPTHS[d].usd}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{DEPTHS[d].detail}</span>
                </span>
              </Label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Specs({ specs }: { specs: Record<string, unknown> }) {
  const entries = Object.entries(specs).filter(([k]) => k !== "Overview");
  if (!entries.length) return <p className="text-xs text-muted-foreground">No specifications on the pages read.</p>;
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted-foreground" title={k}>
            {k}
          </dt>
          <dd className="text-right font-mono text-xs leading-5 tabular-nums">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One product as the AI found it (a proposal item), with approve / reject. */
function ProductItem({ item, canApprove, busy, onDecide }: { item: ProposalItemRead; canApprove: boolean; busy: boolean; onDecide: (approve: boolean) => void }) {
  const p = item.payload as { name: string; model_series?: string | null; category_code: string; standards?: string[]; applications?: string[]; specs?: Record<string, unknown> };
  const specs = p.specs ?? {};
  const service = item.action === "add_service";
  const source = (item.evidence as { url?: string }[])[0]?.url;
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-muted-foreground">
            {service && "Service · "}
            {[p.model_series, p.category_code.split(".").slice(-2).join(" · ")].filter(Boolean).join(" · ")}
            {item.confidence !== null && ` · ${Math.round(Number(item.confidence) * 100)}% confidence`}
          </div>
        </div>
        {item.status !== "pending" ? (
          <StatusBadge status={item.status} />
        ) : canApprove ? (
          <div className="flex gap-1">
            <Button size="sm" disabled={busy} onClick={() => onDecide(true)}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(false)}>
              Reject
            </Button>
          </div>
        ) : (
          <Badge variant="secondary">Waiting for a curator</Badge>
        )}
      </div>
      {typeof specs.Overview === "string" && <p className="text-sm">{specs.Overview}</p>}
      {(p.standards?.length || p.applications?.length) ? (
        <div className="flex flex-wrap gap-1">
          {p.standards?.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
          {p.applications?.map((a) => <Badge key={a} variant="secondary">{a}</Badge>)}
        </div>
      ) : null}
      {!service && <Specs specs={specs} />}
      {source && (
        <a href={source} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          Source page <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

/** Live progress of a product research job, then its products with approve / reject in place. */
export function ProductResults({ jobId, vendorId, onClose }: { jobId: string; vendorId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const canApprove = useCan(P.KNOWLEDGE_APPROVE);
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api<JobRead>(`/jobs/${jobId}`) });
  const done = Boolean(job.data && TERMINAL_JOB_STATUSES.has(job.data.status));
  useLiveJob(jobId, !done);
  const result = job.data?.result as ProductsResult | null | undefined;
  const proposalId = result?.proposal_id ?? null;
  const proposal = useQuery({
    queryKey: ["proposal", proposalId],
    queryFn: () => api<ProposalDetail>(`/admin/proposals/${proposalId}`),
    enabled: Boolean(proposalId && canApprove),
  });
  const decide = useMutation({
    mutationFn: ({ approve, itemIds }: { approve: boolean; itemIds?: string[] }) =>
      api<ProposalDetail>(`/admin/proposals/${proposalId}/${approve ? "approve" : "reject"}`, {
        method: "POST",
        body: { version: proposal.data!.version, item_ids: itemIds ?? null, note: "Decided on the vendor page" },
      }),
    onSuccess: (p, { approve }) => {
      queryClient.setQueryData(["proposal", proposalId], p);
      void queryClient.invalidateQueries({ queryKey: ["vendor", vendorId] });
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(approve ? "Approved" : "Rejected");
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      void proposal.refetch();
    },
  });
  const items = proposal.data?.items ?? [];
  const pending = items.filter((i) => i.status === "pending");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle>Full product details</CardTitle>
          <CardDescription>
            {!done
              ? `${job.data?.stage ? job.data.stage[0].toUpperCase() + job.data.stage.slice(1) : "Starting"}…`
              : job.data?.status === "failed"
                ? errorMessage(job.data.error?.detail ?? "The research failed")
                : result &&
                  `Read ${result.pages_read} pages · ${result.products_kept} of ${result.products_found} kept (${result.services_kept ?? 0} as services) with ${result.specs_kept} specifications` +
                    (result.products_unsupported + result.specs_unsupported
                      ? ` · dropped ${result.products_unsupported} product(s) and ${result.specs_unsupported} value(s) the pages don't show`
                      : "")}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {canApprove && pending.length > 1 && (
            <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ approve: true })}>
              <Check /> Approve all ({pending.length})
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!done && (
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={job.data?.progress ?? 0}>
            <div className="h-full bg-primary transition-all" style={{ width: `${job.data?.progress ?? 2}%` }} />
          </div>
        )}
        {done && result && !proposalId && (
          <p className="text-sm text-muted-foreground">Nothing could be proposed from the pages read{result.not_kept?.length ? "; see why below" : ""}.</p>
        )}
        {done && proposalId && !canApprove && (
          <p className="text-sm text-muted-foreground">The products were sent to the curators for review.</p>
        )}
        {items.map((item) => (
          <ProductItem
            key={item.id}
            item={item}
            canApprove={canApprove}
            busy={decide.isPending}
            onDecide={(approve) => decide.mutate({ approve, itemIds: [item.id] })}
          />
        ))}
        {done && result?.not_kept && <NotKept rows={result.not_kept} />}
        {proposalId && canApprove && (
          <Link href={`/admin/proposals/${proposalId}`} className="text-xs text-muted-foreground hover:underline">
            Open in Approvals
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
