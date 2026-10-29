"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, MessageCircleQuestion, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCertificationTypes, useEquipmentCategories, useIndustries, useServiceCategories } from "@/hooks/use-taxonomy";
import { ApiError, api } from "@/lib/api/client";
import type { ProposalDetail, ProposalItemRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { formatDateTime, humanize, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { countryName, originLabel } from "@/lib/vendors";

const CODE_FIELDS: Record<string, "equipment" | "services" | "certifications" | "industries"> = {
  category_code: "equipment",
  equipment_category_code: "equipment",
  certification_code: "certifications",
  industry_code: "industries",
};

/** Resolves taxonomy codes in payloads to readable names. */
function useCodeNames() {
  const eq = useEquipmentCategories();
  const sv = useServiceCategories();
  const ct = useCertificationTypes();
  const ind = useIndustries();
  return (field: string, code: string, action: string): string => {
    const kind = action === "add_service" && field === "category_code" ? "services" : CODE_FIELDS[field];
    const list = { equipment: eq.data, services: sv.data, certifications: ct.data, industries: ind.data }[kind ?? "equipment"];
    return list?.find((r) => r.code === code)?.name ?? code;
  };
}

function PayloadView({ item }: { item: ProposalItemRead }) {
  const name = useCodeNames();
  const entries = Object.entries(item.payload).filter(
    ([, v]) => v !== null && v !== "" && !(typeof v === "object" && Object.keys(v as object).length === 0),
  );
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {entries.map(([k, v]) => {
        let shown: React.ReactNode = typeof v === "object" ? JSON.stringify(v) : String(v);
        if (k in CODE_FIELDS) shown = <span title={String(v)}>{name(k, String(v), item.action)}</span>;
        else if ((k === "hq_country" || k === "country") && typeof v === "string") shown = countryName(v);
        else if (k === "value" && item.payload.field === "hq_country" && typeof v === "string") shown = countryName(v);
        return (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{humanize(k)}</dt>
            <dd className="break-words">{shown}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function EvidenceView({ evidence }: { evidence: Record<string, unknown>[] }) {
  if (!evidence.length) return null;
  return (
    <div className="grid gap-1.5">
      {evidence.map((e, i) => (
        <div key={i} className="rounded-md bg-muted px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{humanize(String(e.kind ?? "source"))}</Badge>
            {e.url ? (
              <a href={String(e.url)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                {String(e.title || e.url)} <ExternalLink className="size-3" />
              </a>
            ) : (
              <span>{String(e.title ?? "")}</span>
            )}
            {e.page ? <span className="text-muted-foreground">page {String(e.page)}</span> : null}
          </div>
          {e.snippet ? <p className="mt-1 text-muted-foreground">“{String(e.snippet)}”</p> : null}
        </div>
      ))}
    </div>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  required,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  required: boolean;
  pending: boolean;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setNote("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Note" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || (required && !note.trim())} onClick={() => onConfirm(note.trim())}>
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditItemDialog({
  item,
  version,
  proposalId,
  onClose,
}: {
  item: ProposalItemRead | null;
  version: number;
  proposalId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [forItem, setForItem] = useState<string | null>(null);
  if (item && forItem !== item.id) {
    setForItem(item.id);
    setText(JSON.stringify(item.payload, null, 2));
  }
  const save = useMutation({
    mutationFn: () => {
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("The payload isn't valid JSON");
      }
      return api<ProposalDetail>(`/admin/proposals/${proposalId}/items/${item!.id}`, {
        method: "PATCH",
        body: { payload, version },
      });
    },
    onSuccess: (p) => {
      queryClient.setQueryData(["proposal", proposalId], p);
      toast.success("Item updated");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {item ? humanize(item.action).toLowerCase() : "item"}</DialogTitle>
          <DialogDescription>Correct the proposed values before approving. They are validated again on save.</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Payload (JSON)" rows={12} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Decision = "approve" | "reject" | "request-info";

export default function ProposalReviewPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const canReview = useCan(P.KNOWLEDGE_APPROVE);
  const proposal = useQuery({
    queryKey: ["proposal", id],
    queryFn: () => api<ProposalDetail>(`/admin/proposals/${id}`),
    enabled: canReview,
  });
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [editing, setEditing] = useState<ProposalItemRead | null>(null);

  const decide = useMutation({
    mutationFn: ({ action, note }: { action: Decision; note: string }) => {
      const p = proposal.data!;
      const body =
        action === "request-info"
          ? { note, version: p.version }
          : { note, version: p.version, item_ids: [...pendingSelected] };
      return api<ProposalDetail>(`/admin/proposals/${id}/${action}`, { method: "POST", body });
    },
    onSuccess: (p, { action }) => {
      queryClient.setQueryData(["proposal", id], p);
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      setSelected(null);
      setDialog(null);
      toast.success(action === "approve" ? "Approved and applied" : action === "reject" ? "Rejected" : "Sent back for more information");
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (e instanceof ApiError && e.code === "version_conflict") void proposal.refetch();
    },
  });

  if (!canReview) return <NoAccess what="the approvals queue" />;
  if (proposal.isPending) return <Skeleton className="h-64" />;
  if (proposal.isError) return <p className="text-sm text-muted-foreground">{errorMessage(proposal.error)}</p>;
  const p = proposal.data;
  const pending = p.items.filter((i) => i.status === "pending");
  // Every pending item is selected until the curator changes the selection.
  const pendingSelected = new Set(pending.filter((i) => (selected ? selected.has(i.id) : true)).map((i) => i.id));
  const open = p.status === "pending_review" || p.status === "needs_info";

  function toggle(itemId: string, on: boolean) {
    const next = new Set(pendingSelected);
    if (on) next.add(itemId);
    else next.delete(itemId);
    setSelected(next);
  }

  return (
    <>
      <Link href="/admin/proposals" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> Approvals
      </Link>
      <PageHeader
        title={p.title}
        description={`${humanize(p.kind)} · from ${originLabel(p.origin)} · received ${timeAgo(p.created_at)}`}
        actions={<StatusBadge status={p.status} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Items</CardTitle>
              <CardDescription>
                {open
                  ? `${pendingSelected.size} of ${pending.length} pending item${pending.length === 1 ? "" : "s"} selected. A new vendor must be approved before its facts.`
                  : "This proposal is closed."}
              </CardDescription>
            </div>
            {open && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!pendingSelected.size || decide.isPending} onClick={() => setDialog("approve")}>
                  <Check /> Approve {pendingSelected.size}
                </Button>
                <Button size="sm" variant="destructive" disabled={!pendingSelected.size || decide.isPending} onClick={() => setDialog("reject")}>
                  <X /> Reject {pendingSelected.size}
                </Button>
                {p.status === "pending_review" && (
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => setDialog("request-info")}>
                    <MessageCircleQuestion /> Ask for info
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="grid gap-3">
            {p.items.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  {item.status === "pending" && open ? (
                    <Label className="flex items-center gap-2">
                      <Checkbox
                        aria-label={`Select ${humanize(item.action)}`}
                        checked={pendingSelected.has(item.id)}
                        onCheckedChange={(c) => toggle(item.id, Boolean(c))}
                      />
                      <span className="font-medium">{humanize(item.action)}</span>
                    </Label>
                  ) : (
                    <span className="font-medium">{humanize(item.action)}</span>
                  )}
                  <StatusBadge status={item.status} />
                  {item.confidence !== null && (
                    <span className="text-xs text-muted-foreground">{Math.round(Number(item.confidence) * 100)}% confidence</span>
                  )}
                  {item.status === "pending" && open && (
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setEditing(item)}>
                      <Pencil /> Edit
                    </Button>
                  )}
                </div>
                <PayloadView item={item} />
                <EvidenceView evidence={item.evidence} />
                {item.reject_reason && <p className="text-xs text-destructive">Rejected: {item.reject_reason}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Vendor</dt>
                <dd>
                  {p.subject_vendor ? (
                    <Link href={`/vendors/${p.subject_vendor.id}`} className="text-primary hover:underline">
                      {p.subject_vendor.display_name}
                    </Link>
                  ) : (
                    "New (created on approval)"
                  )}
                </dd>
                <dt className="text-muted-foreground">Submitted by</dt>
                <dd className="font-mono text-xs">{p.origin_tenant_id ? `tenant ${p.origin_tenant_id.slice(0, 8)}` : "platform"}</dd>
                <dt className="text-muted-foreground">Version</dt>
                <dd>{p.version}</dd>
                {p.decided_at && (
                  <>
                    <dt className="text-muted-foreground">Decided</dt>
                    <dd>{formatDateTime(p.decided_at)}</dd>
                  </>
                )}
                {p.decision_note && (
                  <>
                    <dt className="text-muted-foreground">Note</dt>
                    <dd className="whitespace-pre-wrap">{p.decision_note}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
          {p.subject_vendor && (
            <Card>
              <CardHeader>
                <CardTitle>Already known</CardTitle>
                <CardDescription>What the knowledge base has for this vendor today.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <div>{p.subject_vendor.domains.join(", ") || "No website"}</div>
                <div className="text-muted-foreground">
                  {p.subject_vendor.equipment.length} equipment · {p.subject_vendor.services.length} services ·{" "}
                  {p.subject_vendor.certifications.length} certifications
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {p.history.length === 0 && <p className="text-muted-foreground">No decisions yet.</p>}
              {p.history.map((h) => (
                <div key={h.id}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{humanize(h.action)}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(h.created_at)}</span>
                  </div>
                  {h.reason && <p className="text-xs text-muted-foreground">{h.reason}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <NoteDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Approve ${pendingSelected.size} item${pendingSelected.size === 1 ? "" : "s"}?`}
        description="They are written to the shared knowledge base straight away. A note is optional."
        confirmLabel="Approve"
        required={false}
        pending={decide.isPending}
        onConfirm={(note) => decide.mutate({ action: "approve", note })}
      />
      <NoteDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reject ${pendingSelected.size} item${pendingSelected.size === 1 ? "" : "s"}?`}
        description="Say why; the reason is kept with the proposal. Rejecting a new vendor rejects all its facts."
        confirmLabel="Reject"
        required
        pending={decide.isPending}
        onConfirm={(note) => decide.mutate({ action: "reject", note })}
      />
      <NoteDialog
        open={dialog === "request-info"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Ask for more information"
        description="The proposal is marked as needing information. Say what's missing."
        confirmLabel="Send"
        required
        pending={decide.isPending}
        onConfirm={(note) => decide.mutate({ action: "request-info", note })}
      />
      <EditItemDialog item={editing} version={p.version} proposalId={id} onClose={() => setEditing(null)} />
    </>
  );
}
