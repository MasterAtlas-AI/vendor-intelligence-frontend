"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Award, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { ApiError, api } from "@/lib/api/client";
import type { Rfq, RfqVendor, VendorPage } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { RFQ_ACTIONS } from "@/lib/rfqs";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

const OPEN = new Set(["draft", "issued", "evaluating"]);

function money(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const n = Number(amount);
  try {
    return currency ? n.toLocaleString(undefined, { style: "currency", currency }) : n.toLocaleString();
  } catch {
    return `${n.toLocaleString()} ${currency ?? ""}`;
  }
}

/** Inline quote entry for one vendor (amount, currency, lead time) or a decline. */
function QuoteEditor({ rfqId, row, onSaved }: { rfqId: string; row: RfqVendor; onSaved: (rows: RfqVendor[]) => void }) {
  const [amount, setAmount] = useState(row.quote_amount ?? "");
  const [currency, setCurrency] = useState(row.currency ?? "USD");
  const [weeks, setWeeks] = useState(row.lead_time_weeks?.toString() ?? "");
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<RfqVendor[]>(`/rfqs/${rfqId}/vendors/${row.vendor.id}`, { method: "PATCH", body }),
    onSuccess: onSaved,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input aria-label={`Quote from ${row.vendor.display_name}`} className="h-8 w-28" inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input aria-label="Currency" className="h-8 w-16 uppercase" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
      <Input aria-label="Lead time in weeks" className="h-8 w-20" inputMode="numeric" placeholder="Weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
      <Button
        size="xs"
        disabled={save.isPending || !amount || Number.isNaN(Number(amount))}
        onClick={() =>
          save.mutate({ quote_amount: Number(amount).toFixed(2), currency: currency || null, lead_time_weeks: weeks ? Number(weeks) : null })
        }
      >
        Save quote
      </Button>
      {row.status !== "declined" && (
        <Button size="xs" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ status: "declined" })}>
          Declined
        </Button>
      )}
    </div>
  );
}

function AddVendor({ rfqId, existing, onSaved }: { rfqId: string; existing: Set<string>; onSaved: (rows: RfqVendor[]) => void }) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 300);
  const found = useQuery({
    queryKey: ["vendors", "pick", term],
    queryFn: ({ signal }) => api<VendorPage>("/vendors", { query: { q: term, limit: 8 }, signal }),
    enabled: term.length >= 2,
  });
  const add = useMutation({
    mutationFn: (vendorId: string) => api<RfqVendor[]>(`/rfqs/${rfqId}/vendors`, { method: "POST", body: { vendor_id: vendorId } }),
    onSuccess: (rows) => {
      onSaved(rows);
      setQ("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-2">
      <Input aria-label="Find a vendor to invite" placeholder="Add a vendor: type a name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {term.length >= 2 && found.data && (
        <div className="grid gap-1 rounded-md border p-1">
          {found.data.items.length === 0 && <p className="p-2 text-sm text-muted-foreground">No vendors match.</p>}
          {found.data.items.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={existing.has(v.id) || add.isPending}
              className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              onClick={() => add.mutate(v.id)}
            >
              <span>{v.display_name}</span>
              <span className="text-xs text-muted-foreground">{existing.has(v.id) ? "On the RFQ" : <Plus className="size-4" />}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RfqPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const rfq = useQuery({ queryKey: ["rfq", id], queryFn: () => api<Rfq>(`/rfqs/${id}`) });
  const vendors = useQuery({ queryKey: ["rfq-vendors", id], queryFn: () => api<RfqVendor[]>(`/rfqs/${id}/vendors`) });
  const [awardTo, setAwardTo] = useState<RfqVendor | null>(null);
  const [confirm, setConfirm] = useState<[string, string] | null>(null);

  const refresh = (rows?: RfqVendor[]) => {
    if (rows) queryClient.setQueryData(["rfq-vendors", id], rows);
    void queryClient.invalidateQueries({ queryKey: ["rfq", id] });
    void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
  };
  const onError = (e: unknown) => {
    toast.error(errorMessage(e));
    if (e instanceof ApiError && e.code === "version_conflict") void rfq.refetch();
  };
  const move = useMutation({
    mutationFn: (path: string) => api<Rfq>(`/rfqs/${id}/${path}`, { method: "POST", body: { version: rfq.data!.version } }),
    onSuccess: (r) => {
      queryClient.setQueryData(["rfq", id], r);
      setConfirm(null);
      refresh();
      void vendors.refetch();
    },
    onError,
  });
  const award = useMutation({
    mutationFn: (vendorId: string) =>
      api<Rfq>(`/rfqs/${id}/award`, { method: "POST", body: { version: rfq.data!.version, vendor_id: vendorId } }),
    onSuccess: (r) => {
      queryClient.setQueryData(["rfq", id], r);
      setAwardTo(null);
      toast.success("RFQ awarded");
      refresh();
      void vendors.refetch();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (vendorId: string) => api(`/rfqs/${id}/vendors/${vendorId}`, { method: "DELETE" }),
    onSuccess: () => {
      void vendors.refetch();
      refresh();
    },
    onError,
  });

  if (rfq.isPending) return <Skeleton className="h-64" />;
  if (rfq.isError) return <p className="text-sm text-muted-foreground">{errorMessage(rfq.error)}</p>;
  const r = rfq.data;
  const rows = vendors.data ?? [];
  const editable = r.can_edit && OPEN.has(r.status);

  return (
    <>
      <Link href="/rfqs" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> RFQs
      </Link>
      <PageHeader
        title={r.title}
        description={[
          r.rfq_number,
          r.project_name && `project ${r.project_name}`,
          r.due_date && `quotes due ${r.due_date}`,
          r.issued_at && `issued ${formatDateTime(r.issued_at)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <StatusBadge status={r.status} />
            {r.can_edit &&
              (RFQ_ACTIONS[r.status] ?? []).map(([path, label]) => (
                <Button key={path} variant={path === "cancel" ? "outline" : "default"} disabled={move.isPending} onClick={() => setConfirm([path, label])}>
                  {label}
                </Button>
              ))}
          </>
        }
      />
      {r.awarded_vendor_name && (
        <p className="mb-4 flex items-center gap-2 text-sm">
          <Award className="size-4 text-emerald-600" /> Awarded to <strong>{r.awarded_vendor_name}</strong>
          {r.awarded_at && <span className="text-muted-foreground">on {formatDateTime(r.awarded_at)}</span>}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader>
            <CardTitle>Vendors and quotes</CardTitle>
            <CardDescription>
              {r.status === "draft"
                ? "Add vendors, then issue the RFQ to invite them."
                : "Record each quote as it arrives; award to the best one. Scores come from the project's scorecards."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {editable && <AddVendor rfqId={id} existing={new Set(rows.map((x) => x.vendor.id))} onSaved={(x) => refresh(x)} />}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Quote</TableHead>
                    <TableHead className="text-right">Lead time</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.isPending && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6" />
                      </TableCell>
                    </TableRow>
                  )}
                  {vendors.isSuccess && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        No vendors yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((row) => (
                    <TableRow key={row.vendor.id} className="align-top">
                      <TableCell className="max-w-56 whitespace-normal">
                        <Link href={`/vendors/${row.vendor.id}`} className="font-medium hover:underline">
                          {row.vendor.display_name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{countryName(row.vendor.hq_country)}</div>
                        {editable && r.status !== "draft" && (row.status === "invited" || row.status === "quoted") && (
                          <div className="mt-2">
                            <QuoteEditor rfqId={id} row={row} onSaved={(x) => refresh(x)} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.quote_amount, row.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.lead_time_weeks !== null ? `${row.lead_time_weeks} wk` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.scorecard_id ? (
                          <Link href={`/scorecards/${row.scorecard_id}`} className="hover:underline">
                            {row.score !== null ? Number(row.score).toFixed(0) : "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.can_edit && (r.status === "issued" || r.status === "evaluating") && row.status === "quoted" && (
                          <Button size="xs" onClick={() => setAwardTo(row)}>
                            <Award /> Award
                          </Button>
                        )}
                        {r.can_edit && r.status === "draft" && (
                          <Button size="xs" variant="ghost" aria-label={`Remove ${row.vendor.display_name}`} onClick={() => remove.mutate(row.vendor.id)}>
                            <Trash2 />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Requirements</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {r.description && <p className="whitespace-pre-wrap text-muted-foreground">{r.description}</p>}
              {r.requirements.length === 0 && !r.description && <p className="text-muted-foreground">None recorded.</p>}
              <ul className="ml-4 list-disc space-y-1">
                {r.requirements.map((req, i) => (
                  <li key={i}>
                    {req.text}
                    {req.mandatory === false && <span className="text-xs text-muted-foreground"> (optional)</span>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `${confirm[1]}?` : ""}
        description={
          confirm?.[0] === "issue"
            ? "The vendors on the list are marked invited. Quotes can then be recorded."
            : confirm?.[0] === "cancel"
              ? "The RFQ is cancelled and can't be reopened."
              : "The RFQ moves to the next step."
        }
        confirmLabel={confirm?.[1] ?? "Confirm"}
        destructive={confirm?.[0] === "cancel"}
        pending={move.isPending}
        onConfirm={() => confirm && move.mutate(confirm[0])}
      />
      <ConfirmDialog
        open={awardTo !== null}
        onOpenChange={(o) => !o && setAwardTo(null)}
        title={`Award to ${awardTo?.vendor.display_name ?? ""}?`}
        description="The other vendors that quoted are marked lost. Recorded in the audit log."
        confirmLabel="Award"
        pending={award.isPending}
        onConfirm={() => awardTo && award.mutate(awardTo.vendor.id)}
      />
    </>
  );
}
