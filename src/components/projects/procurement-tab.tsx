"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterSelect } from "@/components/filter-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { VerificationBadge } from "@/components/verification-badge";
import { api } from "@/lib/api/client";
import type { EquipmentPage, ProcurementRecord, ProcurementWrite, Verification } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { humanize } from "@/lib/format";
import { DEPARTMENTS, VERIFICATION } from "@/lib/history";
import { errorMessage } from "@/lib/validation";

import { dateInput } from "./shared";

const PO_STATUSES: ProcurementRecord["status"][] = ["ordered", "manufacturing", "shipped", "delivered", "cancelled"];

type TechnicalStatus = NonNullable<ProcurementRecord["technical_status"]>;

/** Technical bid evaluation (TBE) results. */
const TBE: Record<TechnicalStatus, { label: string; className: string }> = {
  accepted: { label: "Technically accepted", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  conditional: { label: "Accepted with conditions", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  rejected: { label: "Not accepted", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

interface PoForm {
  record_type: ProcurementRecord["record_type"];
  technical_status: TechnicalStatus | "";
  equipment_id: string;
  vendor_name: string;
  po_number: string;
  po_date: string;
  promised_date: string;
  delivered_date: string;
  lead_time_weeks: string;
  manufacturing_weeks: string;
  amount: string;
  currency: string;
  status: ProcurementRecord["status"];
  performance_rating: string;
  notes: string;
  department: string;
  verification: Verification;
}

const EMPTY: PoForm = {
  record_type: "po",
  technical_status: "",
  equipment_id: "",
  vendor_name: "",
  po_number: "",
  po_date: "",
  promised_date: "",
  delivered_date: "",
  lead_time_weeks: "",
  manufacturing_weeks: "",
  amount: "",
  currency: "",
  status: "ordered",
  performance_rating: "",
  notes: "",
  department: "",
  verification: "user_entered",
};

function toForm(r: ProcurementRecord): PoForm {
  return {
    record_type: r.record_type,
    technical_status: r.technical_status ?? "",
    equipment_id: r.equipment_id ?? "",
    vendor_name: r.vendor_name,
    po_number: r.po_number,
    po_date: dateInput(r.po_date),
    promised_date: dateInput(r.promised_date),
    delivered_date: dateInput(r.delivered_date),
    lead_time_weeks: r.lead_time_weeks?.toString() ?? "",
    manufacturing_weeks: r.manufacturing_weeks?.toString() ?? "",
    amount: r.amount ?? "",
    currency: r.currency ?? "",
    status: r.status,
    performance_rating: r.performance_rating?.toString() ?? "",
    notes: r.notes,
    department: r.department ?? "",
    verification: r.verification,
  };
}

function num(v: string): number | null {
  const n = Number(v.replace(/,/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
}

function PoDialog({
  projectId,
  record,
  open,
  onOpenChange,
}: {
  projectId: string;
  record: ProcurementRecord | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const canCommercial = useCan(P.COMMERCIAL_READ);
  const [form, setForm] = useState<PoForm>(() => (record ? toForm(record) : EMPTY));
  const equipment = useQuery({
    queryKey: ["equipment", "project", projectId, "pick"],
    queryFn: () => api<EquipmentPage>("/equipment/search", { method: "POST", body: { project_ids: [projectId], limit: 500 } }),
    enabled: open,
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: () => {
      const body: ProcurementWrite = {
        project_id: projectId,
        equipment_id: form.equipment_id || null,
        vendor_id: record?.vendor_id ?? null,
        vendor_name: form.vendor_name.trim(),
        record_type: form.record_type,
        technical_status: form.technical_status || null,
        po_number: form.po_number.trim(),
        po_date: form.po_date || null,
        promised_date: form.promised_date || null,
        delivered_date: form.delivered_date || null,
        lead_time_weeks: num(form.lead_time_weeks),
        manufacturing_weeks: num(form.manufacturing_weeks),
        status: form.status,
        performance_rating: num(form.performance_rating),
        notes: form.notes.trim(),
        department: (form.department || null) as ProcurementWrite["department"],
        verification: form.verification,
      };
      // Without commercial access the amount is hidden: leave it out so an edit doesn't wipe it.
      if (canCommercial) {
        body.amount = num(form.amount);
        body.currency = form.currency.trim().toUpperCase() || null;
      }
      return record
        ? api<ProcurementRecord>(`/procurement-records/${record.id}`, { method: "PUT", body })
        : api<ProcurementRecord>("/procurement-records", { method: "POST", body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["procurement-records"] });
      toast.success(record ? "Purchase order updated" : "Purchase order added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const text = (key: keyof PoForm, label: string, type = "text", placeholder = "") => (
    <div className="grid gap-1.5">
      <Label htmlFor={`po-${key}`}>{label}</Label>
      <Input
        id={`po-${key}`}
        type={type}
        placeholder={placeholder}
        inputMode={type === "number" ? "decimal" : undefined}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "Edit purchase order" : "Add purchase order"}</DialogTitle>
          <DialogDescription>Dates, lead times and how the vendor performed on this order.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("vendor_name", "Vendor")}
          {text("po_number", form.record_type === "quotation" ? "Quotation number" : "PO number")}
          <div className="grid gap-1.5">
            <Label>Record type</Label>
            <FilterSelect
              label="Record type"
              anyLabel="Purchase order"
              value={form.record_type === "po" ? "" : form.record_type}
              onChange={(v) => setForm({ ...form, record_type: (v || "po") as PoForm["record_type"] })}
              options={[{ value: "quotation", label: "Quotation" }]}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>TBE result</Label>
            <FilterSelect
              label="Technical bid evaluation result"
              anyLabel="Not evaluated"
              value={form.technical_status}
              onChange={(v) => setForm({ ...form, technical_status: v as PoForm["technical_status"] })}
              options={(Object.keys(TBE) as TechnicalStatus[]).map((k) => ({ value: k, label: TBE[k].label }))}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Equipment line</Label>
            <FilterSelect
              label="Equipment line"
              anyLabel="Not linked to an equipment line"
              value={form.equipment_id}
              onChange={(v) => setForm({ ...form, equipment_id: v })}
              options={(equipment.data?.items ?? []).map((e) => ({ value: e.id, label: [e.tag, e.name].filter(Boolean).join(" · ") || e.id }))}
              className="w-full"
            />
          </div>
          {text("po_date", "PO date", "date")}
          {text("promised_date", "Promised delivery", "date")}
          {text("delivered_date", "Delivered", "date")}
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <FilterSelect
              label="PO status"
              anyLabel="Ordered"
              value={form.status === "ordered" ? "" : form.status}
              onChange={(v) => setForm({ ...form, status: (v || "ordered") as PoForm["status"] })}
              options={PO_STATUSES.filter((s) => s !== "ordered").map((s) => ({ value: s, label: humanize(s) }))}
              className="w-full"
            />
          </div>
          {text("lead_time_weeks", "Lead time (weeks)", "number")}
          {text("manufacturing_weeks", "Manufacturing (weeks)", "number")}
          {canCommercial && (
            <>
              {text("amount", "Amount", "number")}
              {text("currency", "Currency", "text", "USD")}
            </>
          )}
          <div className="grid gap-1.5">
            <Label>Performance rating</Label>
            <FilterSelect
              label="Performance rating"
              anyLabel="Not rated"
              value={form.performance_rating}
              onChange={(v) => setForm({ ...form, performance_rating: v })}
              options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} / 5` }))}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Department</Label>
            <FilterSelect
              label="Department"
              anyLabel="Not set"
              value={form.department}
              onChange={(v) => setForm({ ...form, department: v })}
              options={DEPARTMENTS.map(([value, label]) => ({ value, label }))}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Verification</Label>
            <FilterSelect
              label="Verification"
              anyLabel={VERIFICATION.user_entered.label}
              value={form.verification === "user_entered" ? "" : form.verification}
              onChange={(v) => setForm({ ...form, verification: (v || "user_entered") as Verification })}
              options={(["verified", "historical"] as const).map((v) => ({ value: v, label: VERIFICATION[v].label }))}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea id="po-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={(!form.vendor_name.trim() && !form.po_number.trim()) || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TbeBadge({ value }: { value: ProcurementRecord["technical_status"] }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TBE[value].className}`}>{TBE[value].label}</span>;
}

function OnTime({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return value ? <span className="text-emerald-700 dark:text-emerald-400">On time</span> : <span className="text-amber-700 dark:text-amber-400">Late</span>;
}

/** Purchase orders placed on the project: dates, lead times, on-time delivery and vendor performance. */
export function ProjectProcurement({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const [editing, setEditing] = useState<{ record: ProcurementRecord | null } | null>(null);
  const [deleting, setDeleting] = useState<ProcurementRecord | null>(null);
  const records = useQuery({
    queryKey: ["procurement-records", { project_id: projectId }],
    queryFn: () => api<ProcurementRecord[]>("/procurement-records", { query: { project_id: projectId } }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/procurement-records/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["procurement-records"] });
      setDeleting(null);
      toast.success("Purchase order deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = records.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Procurement</CardTitle>
          <CardDescription>Purchase orders on this project, with lead times and how each vendor delivered.</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setEditing({ record: null })}>
            <Plus /> Add PO
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>TBE</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lead time</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.isPending && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {records.isError && (
                <TableRow>
                  <TableCell colSpan={10} className="whitespace-normal text-destructive">
                    {errorMessage(records.error)}
                  </TableCell>
                </TableRow>
              )}
              {records.isSuccess && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center whitespace-normal text-muted-foreground">
                    No purchase orders recorded. Approved MEL rows with a PO number add them automatically.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-40 whitespace-normal">
                    <div className="font-mono text-xs">{r.po_number || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.po_date ? dateInput(r.po_date) : ""}</div>
                    <div className="mt-1">
                      <VerificationBadge value={r.verification} />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.record_type === "quotation" ? "Quotation" : "PO"}</TableCell>
                  <TableCell className="max-w-40 text-sm whitespace-normal">
                    {r.vendor_id ? (
                      <Link href={`/vendors/${r.vendor_id}`} className="hover:underline">
                        {r.vendor_name || "—"}
                      </Link>
                    ) : (
                      r.vendor_name || "—"
                    )}
                    {r.equipment_id && (
                      <div>
                        <Link href={`/equipment/${r.equipment_id}`} className="text-xs text-muted-foreground hover:underline">
                          Equipment line
                        </Link>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <TbeBadge value={r.technical_status ?? null} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {r.lead_time_weeks !== null ? `${r.lead_time_weeks} wk` : "—"}
                    {r.manufacturing_weeks !== null && <div className="text-xs text-muted-foreground">{r.manufacturing_weeks} wk mfg</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <OnTime value={r.on_time} />
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {[r.promised_date && `due ${dateInput(r.promised_date)}`, r.delivered_date && `got ${dateInput(r.delivered_date)}`].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {r.commercial_hidden ? (
                      <span className="text-muted-foreground">Hidden</span>
                    ) : r.amount !== null ? (
                      `${Number(r.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${r.currency ?? ""}`
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.performance_rating ? `${r.performance_rating}/5` : "—"}</TableCell>
                  {canManage && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="xs" variant="ghost" aria-label={`Edit PO ${r.po_number}`} onClick={() => setEditing({ record: r })}>
                        <Pencil />
                      </Button>
                      <Button size="xs" variant="ghost" aria-label={`Delete PO ${r.po_number}`} onClick={() => setDeleting(r)}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {editing && (
        <PoDialog
          key={editing.record?.id ?? "new"}
          projectId={projectId}
          record={editing.record}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this purchase order?"
        description={`PO ${deleting?.po_number || ""} from ${deleting?.vendor_name || "this vendor"} will be removed from the project's history.`}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Card>
  );
}
