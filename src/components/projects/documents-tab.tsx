"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, Gauge, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterSelect } from "@/components/filter-select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDebounced } from "@/hooks/use-debounced";
import { api, download } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { Equipment, EquipmentPage } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

type ProjectDocument = components["schemas"]["ProjectDocumentRead"];
type DocumentRatings = components["schemas"]["DocumentRatings"];
type Rating = DocumentRatings["ratings"][number];

/** Documents whose figures describe the equipment itself. */
const RATED_TYPES = new Set(["datasheet", "specification", "other"]);

const showValue = (v: Rating["current"], unit: string) => {
  if (v === null || v === undefined || v === "") return "—";
  const text = Array.isArray(v)
    ? v.length >= 2
      ? `${v[0].toLocaleString()} – ${v[v.length - 1].toLocaleString()}`
      : (v[0]?.toLocaleString() ?? "—")
    : typeof v === "number"
      ? v.toLocaleString()
      : v;
  return unit && typeof v !== "string" ? `${text} ${unit}` : text;
};
const same = (a: Rating["current"], b: Rating["found"]) => JSON.stringify(a) === JSON.stringify(b);

/** SOW 3.11 / 3.12 / 8.4: the ratings a datasheet gives, beside the line's current values; ticked ones are copied
 *  onto the line (an ordinary equipment edit, in its history). Read on the server; no AI. */
function RatingsDialog({ doc, onClose }: { doc: ProjectDocument; onClose: () => void }) {
  const queryClient = useQueryClient();
  const found = useQuery({
    queryKey: ["document-ratings", doc.id],
    queryFn: () => api<DocumentRatings>(`/project-documents/${doc.id}/ratings`),
  });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const ratings = found.data?.ratings ?? [];
  const chosen = picked ?? new Set(ratings.filter((r) => !same(r.current, r.found)).map((r) => r.key));
  const copy = useMutation({
    mutationFn: async () => {
      const lineId = found.data?.equipment_id;
      if (!lineId) throw new Error("This document isn't tied to an equipment line");
      const line = await api<Equipment>(`/equipment/${lineId}`);
      if (found.data?.equipment_version != null && line.version !== found.data.equipment_version) {
        void queryClient.invalidateQueries({ queryKey: ["document-ratings", doc.id] });
        throw new Error("The line was changed since these ratings were compared. They have been refreshed: check them and copy again.");
      }
      const attributes = { ...(line.attributes ?? {}) };
      for (const r of ratings) if (chosen.has(r.key)) attributes[r.key] = r.found;
      return api<Equipment>(`/equipment/${lineId}`, { method: "PATCH", body: { version: line.version, attributes } });
    },
    onSuccess: () => {
      toast.success(`${chosen.size} rating${chosen.size === 1 ? "" : "s"} copied to ${found.data?.equipment_label || "the line"}`);
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["document-ratings", doc.id] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ratings in {doc.title}</DialogTitle>
          <DialogDescription>
            {found.data?.equipment_label
              ? `Figures read from the file, beside the current values of ${found.data.equipment_label}. Tick the ones to copy onto the line.`
              : "Figures read from the file. Tie the document to an equipment line to copy them onto it."}
          </DialogDescription>
        </DialogHeader>
        {found.isPending && <Skeleton className="h-32" />}
        {found.isError && <p className="text-sm text-destructive">{errorMessage(found.error)}</p>}
        {found.data && ratings.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {doc.text_chars === 0
              ? "No text could be read from this file (a drawing or a scanned page)."
              : "No ratings with units were found (for example \"Rated flow: 120 m3/h\" or a \"Capacity (m3/h) | 120\" table row)."}
          </p>
        )}
        {ratings.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Rating</TableHead>
                  <TableHead>In the document</TableHead>
                  <TableHead>On the line now</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ratings.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Copy ${r.label}`}
                        checked={chosen.has(r.key)}
                        disabled={!found.data?.equipment_id || same(r.current, r.found)}
                        onCheckedChange={(c) => {
                          const next = new Set(chosen);
                          if (c) next.add(r.key);
                          else next.delete(r.key);
                          setPicked(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.label}</div>
                      <div className="max-w-64 truncate text-xs text-muted-foreground" title={r.source}>
                        {r.source}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{showValue(r.found, r.unit)}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {same(r.current, r.found) ? "Same" : showValue(r.current, r.unit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {found.data?.equipment_id && ratings.length > 0 && (
            <Button disabled={chosen.size === 0 || copy.isPending} onClick={() => copy.mutate()}>
              Copy {chosen.size} to the line
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** SOW 3.13 / 3.14 / 3.17 / 14.6: the kinds of project document. */
export const DOC_TYPES = [
  { value: "drawing", label: "Vendor drawing" },
  { value: "datasheet", label: "Datasheet" },
  { value: "specification", label: "Specification" },
  { value: "correspondence", label: "Correspondence" },
  { value: "schedule", label: "Schedule" },
  { value: "report", label: "Report" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
] as const;

const typeLabel = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? t;
const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The project's equipment lines, for linking a document to one (tag · description). */
function useLineOptions(projectId: string, enabled: boolean) {
  const lines = useQuery({
    queryKey: ["equipment", "search", "lines-for-docs", projectId],
    queryFn: () => api<EquipmentPage>("/equipment/search", { method: "POST", body: { project_ids: [projectId], limit: 500 } }),
    enabled,
    staleTime: 60_000,
  });
  return (lines.data?.items ?? []).map((e) => ({ value: e.id, label: [e.tag, e.name].filter(Boolean).join(" · ") || "Untitled line" }));
}

function AddDocumentDialog({ projectId, equipmentId, onClose }: { projectId: string; equipmentId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const lineOptions = useLineOptions(projectId, !equipmentId);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ doc_type: "drawing", title: "", doc_number: "", revision: "", doc_date: "", equipment_id: equipmentId ?? "", notes: "" });
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const save = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("file", file!);
      for (const [key, value] of Object.entries(form)) if (value.trim()) body.append(key, value.trim());
      return api<ProjectDocument>(`/projects/${projectId}/documents`, { method: "POST", body });
    },
    onSuccess: () => {
      toast.success("Document added");
      void queryClient.invalidateQueries({ queryKey: ["project-documents"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>A vendor drawing, letter, schedule or other project document. It stays private to your organization.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !form.title) set("title")(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
            <span className="text-xs text-muted-foreground">Any type (PDF, DWG, Word, e-mail…), up to 10 MB.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <FilterSelect label="Type" anyLabel="Vendor drawing" value={form.doc_type === "drawing" ? "" : form.doc_type} onChange={(v) => set("doc_type")(v || "drawing")} options={DOC_TYPES.filter((d) => d.value !== "drawing").map((d) => ({ ...d }))} className="w-full" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-number">Document number</Label>
              <Input id="doc-number" placeholder="e.g. 20171-SPOG-62400-MA-DW-0002" value={form.doc_number} onChange={(e) => set("doc_number")(e.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={form.title} onChange={(e) => set("title")(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-rev">Revision</Label>
              <Input id="doc-rev" placeholder="e.g. Z1" value={form.revision} onChange={(e) => set("revision")(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-date">Date</Label>
              <DatePicker id="doc-date" value={form.doc_date} onChange={set("doc_date")} placeholder="Document date" />
            </div>
            {!equipmentId && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Equipment line (optional)</Label>
                <FilterSelect label="Equipment line" anyLabel="Not tied to a line" value={form.equipment_id} onChange={set("equipment_id")} options={lineOptions} className="w-full" />
              </div>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="doc-notes">Notes</Label>
              <Textarea id="doc-notes" rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!file || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Uploading…" : "Add document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A table of documents with download and (for data administrators) delete. */
function DocumentTable({ docs, showLine }: { docs: ProjectDocument[]; showLine: boolean }) {
  const queryClient = useQueryClient();
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const [removing, setRemoving] = useState<ProjectDocument | null>(null);
  const [rating, setRating] = useState<ProjectDocument | null>(null);
  const remove = useMutation({
    mutationFn: (d: ProjectDocument) => api(`/project-documents/${d.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Document deleted");
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["project-documents"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Rev.</TableHead>
            {showLine && <TableHead>Equipment</TableHead>}
            <TableHead>Date</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="max-w-96 whitespace-normal">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">
                  {[d.doc_number, d.filename, size(d.size_bytes)].filter(Boolean).join(" · ")}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{typeLabel(d.doc_type)}</Badge>
              </TableCell>
              <TableCell className="text-sm">{d.revision || "—"}</TableCell>
              {showLine && (
                <TableCell className="text-sm">
                  {d.equipment_id ? (
                    <Link href={`/equipment/${d.equipment_id}`} className="hover:underline">
                      {d.equipment_label || "Line"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              )}
              <TableCell className="text-sm text-muted-foreground">{d.doc_date ?? timeAgo(d.created_at)}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {canManage && d.equipment_id && RATED_TYPES.has(d.doc_type) && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Read ratings from ${d.title}`} title="Read ratings for the line" onClick={() => setRating(d)}>
                    <Gauge />
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Download ${d.filename}`}
                  onClick={() => void download(`/project-documents/${d.id}/file`, d.filename).catch((e: unknown) => toast.error(errorMessage(e)))}
                >
                  <Download />
                </Button>
                {canManage && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => setRemoving(d)}>
                    <Trash2 />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete ${removing?.title ?? "this document"}?`}
        description="The file is removed from this project. The audit log keeps a record that it existed."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
      {rating && <RatingsDialog doc={rating} onClose={() => setRating(null)} />}
    </div>
  );
}

/** Project tab: the document register (drawings, correspondence, schedules...), filterable, with upload. */
export function ProjectDocuments({ projectId }: { projectId: string }) {
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const docs = useQuery({
    queryKey: ["project-documents", projectId, type, q],
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`, { query: { doc_type: type || undefined, q: q || undefined } }),
    placeholderData: (previous) => previous,
  });
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Documents</CardTitle>
          <CardDescription>Vendor drawings, correspondence, schedules, datasheets and reports for this project, each optionally tied to an equipment line.</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <FileUp /> Add document
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search documents" placeholder="Number, title or file name" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FilterSelect label="Type" anyLabel="All types" value={type} onChange={setType} options={DOC_TYPES.map((d) => ({ ...d }))} className="w-48" />
        </div>
        {docs.isPending && <Skeleton className="h-24" />}
        {docs.isError && <p className="text-sm text-destructive">{errorMessage(docs.error)}</p>}
        {docs.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{type || q ? "No documents match." : "No documents yet."}</p>
        )}
        {docs.data && docs.data.length > 0 && <DocumentTable docs={docs.data} showLine />}
      </CardContent>
      {adding && <AddDocumentDialog projectId={projectId} onClose={() => setAdding(false)} />}
    </Card>
  );
}

/** Equipment page: the documents tied to this line (its drawings, datasheets, schedule), with upload. */
export function EquipmentDocuments({ projectId, equipmentId }: { projectId: string; equipmentId: string }) {
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const [adding, setAdding] = useState(false);
  const docs = useQuery({
    queryKey: ["project-documents", projectId, "line", equipmentId],
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`, { query: { equipment_id: equipmentId } }),
  });
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Documents</CardTitle>
          <CardDescription>Drawings, datasheets, schedules and letters for this equipment.</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <FileUp /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {docs.isPending && <Skeleton className="h-12" />}
        {docs.data?.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {docs.data && docs.data.length > 0 && <DocumentTable docs={docs.data} showLine={false} />}
      </CardContent>
      {adding && <AddDocumentDialog projectId={projectId} equipmentId={equipmentId} onClose={() => setAdding(false)} />}
    </Card>
  );
}
