"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { VerificationBadge } from "@/components/verification-badge";
import { api } from "@/lib/api/client";
import type { Equipment, KnowledgeNote, NoteWrite, ProcurementRecord } from "@/lib/api/types";
import { formatDateTime, humanize } from "@/lib/format";
import { DEPARTMENTS, NOTE_KINDS, departmentLabel } from "@/lib/history";
import { errorMessage } from "@/lib/validation";

function money(amount: string | null, currency: string | null): string {
  if (amount === null) return "—";
  const n = Number(amount);
  try {
    return currency ? n.toLocaleString(undefined, { style: "currency", currency }) : n.toLocaleString();
  } catch {
    return `${n.toLocaleString()} ${currency ?? ""}`;
  }
}

/** Purchase orders and deliveries for this equipment. Amounts are withheld by the API without commercial:read. */
export function ProcurementPanel({ equipmentId }: { equipmentId: string }) {
  const records = useQuery({
    queryKey: ["procurement-records", "equipment", equipmentId],
    queryFn: () => api<ProcurementRecord[]>("/procurement-records", { query: { equipment_id: equipmentId } }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Procurement</CardTitle>
        <CardDescription>Purchase orders, lead times and delivery performance.</CardDescription>
      </CardHeader>
      <CardContent>
        {records.isPending && <Skeleton className="h-16" />}
        {records.isError && <p className="text-sm text-destructive">{errorMessage(records.error)}</p>}
        {records.data?.length === 0 && <p className="text-sm text-muted-foreground">No purchase orders recorded for this equipment.</p>}
        {(records.data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lead time</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Verification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.data?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.po_number || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.po_date ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.vendor_id ? (
                        <Link href={`/vendors/${r.vendor_id}`} className="hover:underline">
                          {r.vendor_name || "—"}
                        </Link>
                      ) : (
                        r.vendor_name || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{humanize(r.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.lead_time_weeks !== null ? `${r.lead_time_weeks} wk` : "—"}
                      {r.manufacturing_weeks !== null && <div className="text-xs text-muted-foreground">{r.manufacturing_weeks} wk mfg</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.delivered_date ?? "—"}
                      {r.on_time !== null && <div className={`text-xs ${r.on_time ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{r.on_time ? "On time" : "Late"}</div>}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.commercial_hidden ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Ask a Tenant Admin for commercial access">
                          <Lock className="size-3" /> Hidden (needs commercial access)
                        </span>
                      ) : (
                        money(r.amount, r.currency)
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{r.performance_rating !== null ? `${r.performance_rating}/5` : "—"}</TableCell>
                    <TableCell>
                      <VerificationBadge value={r.verification} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddNote({ equipment, onDone }: { equipment: Equipment; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>("lesson_learned");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [department, setDepartment] = useState("");
  const add = useMutation({
    mutationFn: () => {
      const note: NoteWrite = {
        kind: kind as NoteWrite["kind"],
        title: title.trim(),
        body: body.trim(),
        equipment_id: equipment.id,
        project_id: equipment.project.id,
        vendor_id: equipment.vendor_id,
        category_code: equipment.category_code,
        department: (department || null) as NoteWrite["department"],
        verification: "user_entered",
      };
      return api<KnowledgeNote>("/knowledge-notes", { method: "POST", body: note });
    },
    onSuccess: () => {
      toast.success("Note added");
      void queryClient.invalidateQueries({ queryKey: ["knowledge-notes", "equipment", equipment.id] });
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Kind</Label>
          <FilterSelect
            label="Kind"
            anyLabel="Lesson learned"
            value={kind === "lesson_learned" ? "" : kind}
            onChange={(v) => setKind(v || "lesson_learned")}
            options={NOTE_KINDS.filter(([v]) => v !== "lesson_learned").map(([value, label]) => ({ value, label }))}
            className="w-full"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Department</Label>
          <FilterSelect
            label="Department"
            anyLabel="No department"
            value={department}
            onChange={setDepartment}
            options={DEPARTMENTS.map(([value, label]) => ({ value, label }))}
            className="w-full"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note-title">Title</Label>
        <Input id="note-title" placeholder="e.g. Mechanical seal failures after 6 months" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note-body">Details</Label>
        <Textarea id="note-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!title.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? "Adding…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

/** Lessons learned, operating feedback, maintenance and spares notes about this equipment. */
export function NotesPanel({ equipment }: { equipment: Equipment }) {
  const [adding, setAdding] = useState(false);
  const notes = useQuery({
    queryKey: ["knowledge-notes", "equipment", equipment.id],
    queryFn: () => api<KnowledgeNote[]>("/knowledge-notes", { query: { equipment_id: equipment.id } }),
  });
  const kindLabel = (k: string) => NOTE_KINDS.find(([v]) => v === k)?.[1] ?? humanize(k);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge notes</CardTitle>
        <CardDescription>Lessons learned, operating feedback, maintenance and spares.</CardDescription>
        {!adding && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add note
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {adding && <AddNote equipment={equipment} onDone={() => setAdding(false)} />}
        {notes.isPending && <Skeleton className="h-16" />}
        {notes.isError && <p className="text-sm text-destructive">{errorMessage(notes.error)}</p>}
        {notes.data?.length === 0 && !adding && <p className="text-sm text-muted-foreground">No notes yet. Share what the team learned about this equipment.</p>}
        {notes.data?.map((n) => (
          <div key={n.id} className="grid gap-1 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{kindLabel(n.kind)}</Badge>
              <span className="font-medium">{n.title}</span>
              <span className="ml-auto">
                <VerificationBadge value={n.verification} />
              </span>
            </div>
            {n.body && <p className="text-sm whitespace-pre-line">{n.body}</p>}
            <div className="text-xs text-muted-foreground">
              {[n.department ? departmentLabel(n.department) : "", n.project_name ?? "", formatDateTime(n.created_at)].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
