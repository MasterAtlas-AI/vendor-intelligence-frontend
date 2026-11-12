"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, Pencil, Play, Radio, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { ProgressBar } from "@/components/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TERMINAL_JOB_STATUSES, useLiveJob } from "@/hooks/use-live-job";
import { api } from "@/lib/api/client";
import type { JobAccepted, JobRead, MelDecisionResult, MelRow, MelRows, MelSheet, MelUpload, MelUploadSummary } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { humanize, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/validation";

import { attributeSummary, useAttributeIndex, useCategoryOptions } from "./shared";

const ACCEPT = ".xlsx,.xlsm,.csv,.docx";
const MAX_MB = 10; // backend UPLOAD_MAX_BYTES
const BATCH = 200; // ids per decide request
const SHOW_STEP = 200; // rows rendered at a time
const NOT_MAPPED = "";

/** The MEL being reviewed on this project, kept across reloads (there's no API to list a project's uploads). */
interface Session {
  uploadId: string;
  filename: string;
  jobId: string | null;
}

const storageKey = (projectId: string) => `mel-import:${projectId}`;

function loadSession(projectId: string): Session | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? "null") as Session | null;
    return saved?.uploadId && saved.jobId ? saved : null; // an unparsed upload can't be resumed: its sheets aren't kept
  } catch {
    return null;
  }
}

function saveSession(projectId: string, session: Session | null) {
  try {
    if (session) localStorage.setItem(storageKey(projectId), JSON.stringify(session));
    else localStorage.removeItem(storageKey(projectId));
  } catch {
    // storage unavailable: the review just won't survive a reload
  }
}

function columnLetter(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ---------------------------------------------------------------- step 1: upload

function UploadMel({ projectId, onUploaded }: { projectId: string; onUploaded: (upload: MelUpload) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<MelUpload>(`/projects/${projectId}/mel`, { method: "POST", body: form });
    },
    onSuccess: onUploaded,
  });
  function pick(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setLocalError(`The file is larger than ${MAX_MB} MB.`);
      return;
    }
    upload.mutate(file);
  }
  const error = localError ?? (upload.isError ? errorMessage(upload.error) : null);
  return (
    <div>
      <button
        type="button"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:bg-muted/50",
        )}
      >
        <FileUp className="size-10 text-muted-foreground" />
        <div className="font-medium">{upload.isPending ? "Uploading and reading the MEL…" : "Drop the MEL here, or click to choose"}</div>
        <div className="max-w-md text-sm text-muted-foreground">
          <strong>Excel, CSV or Word</strong> (a table): one equipment line per row, with tag, description, vendor and ratings. Up to {MAX_MB} MB.
          Nothing is recorded until you review and approve the rows.
        </div>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Choose a MEL file"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- step 2: column mapping

function SheetMapping({
  projectId,
  upload,
  sheet,
  onStarted,
}: {
  projectId: string;
  upload: MelUpload;
  sheet: MelSheet;
  onStarted: (jobId: string) => void;
}) {
  const [headerRow, setHeaderRow] = useState(String(sheet.header_row));
  const [mapping, setMapping] = useState<Record<string, number>>(sheet.suggested_mapping);
  const fieldOf = (col: number) => Object.entries(mapping).find(([, c]) => c === col)?.[0] ?? NOT_MAPPED;
  const setColumn = (col: number, field: string) => {
    const next = Object.fromEntries(Object.entries(mapping).filter(([f, c]) => c !== col && f !== field));
    if (field) next[field] = col;
    setMapping(next);
  };
  const fields = Object.entries(upload.fields);
  const options = [
    ...fields.filter(([k]) => !k.startsWith("attr:")).map(([value, label]) => ({ value, label })),
    ...fields.filter(([k]) => k.startsWith("attr:")).map(([value, label]) => ({ value, label: `Rating · ${label}` })),
  ];
  const header = Number.parseInt(headerRow, 10);
  const parse = useMutation({
    mutationFn: () =>
      api<JobAccepted>(`/mel/${upload.upload_id}/parse`, {
        method: "POST",
        body: { project_id: projectId, sheet: sheet.name, header_row: Number.isFinite(header) && header > 0 ? header : null, mapping },
      }),
    onSuccess: (job) => onStarted(job.job_id),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const mapped = Object.keys(mapping).length;
  const hasName = "name" in mapping || "tag" in mapping;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="mel-header-row">Header row</Label>
          <Input
            id="mel-header-row"
            inputMode="numeric"
            className="w-24"
            value={headerRow}
            onChange={(e) => setHeaderRow(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
        <p className="pb-2 text-sm text-muted-foreground">
          {sheet.data_rows} data rows · {mapped} of {sheet.headers.length} columns mapped. Unmapped columns are kept with each row as remarks.
        </p>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Col</TableHead>
              <TableHead>Header in the file</TableHead>
              <TableHead>Read as</TableHead>
              <TableHead>Sample values</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.headers.map((h, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs text-muted-foreground">{columnLetter(i)}</TableCell>
                <TableCell className="max-w-48 font-medium whitespace-normal">{h || <span className="text-muted-foreground">(no header)</span>}</TableCell>
                <TableCell>
                  <FilterSelect
                    label={`Field for column ${columnLetter(i)}`}
                    anyLabel="Not imported"
                    value={fieldOf(i)}
                    onChange={(f) => setColumn(i, f)}
                    options={options}
                    className="w-52"
                  />
                </TableCell>
                <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={sheet.sample.map((r) => r[i] ?? "").join(" | ")}>
                  {sheet.sample
                    .map((r) => r[i])
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(" · ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {sheet.sample.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-primary hover:underline">First {sheet.sample.length} rows as in the file</summary>
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  {sheet.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                      {h || columnLetter(i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.sample.map((r, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    {sheet.headers.map((_, ci) => (
                      <td key={ci} className="max-w-48 truncate px-2 py-1">
                        {r[ci] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <div className="flex items-center justify-end gap-3">
        {!hasName && <span className="text-sm text-amber-700 dark:text-amber-400">Map at least the description or the tag.</span>}
        <Button disabled={!hasName || parse.isPending} onClick={() => parse.mutate()}>
          <Play /> {parse.isPending ? "Starting…" : "Read the rows"}
        </Button>
      </div>
    </div>
  );
}

function MappingStep({ projectId, upload, onStarted }: { projectId: string; upload: MelUpload; onStarted: (jobId: string) => void }) {
  const [sheetName, setSheetName] = useState(upload.sheets[0]?.name ?? "");
  const sheet = upload.sheets.find((s) => s.name === sheetName) ?? upload.sheets[0];
  if (!sheet) return <p className="text-sm text-destructive">No table was found in this file.</p>;
  return (
    <div className="grid gap-4">
      {upload.sheets.length > 1 && (
        <div className="grid gap-1.5">
          <Label>Sheet</Label>
          <FilterSelect
            label="Sheet"
            anyLabel={upload.sheets[0]!.name}
            value={sheet.name === upload.sheets[0]!.name ? "" : sheet.name}
            onChange={(v) => setSheetName(v || upload.sheets[0]!.name)}
            options={upload.sheets.slice(1).map((s) => ({ value: s.name, label: `${s.name} (${s.data_rows} rows)` }))}
            className="w-64"
          />
        </div>
      )}
      <SheetMapping key={sheet.name} projectId={projectId} upload={upload} sheet={sheet} onStarted={onStarted} />
    </div>
  );
}

// ---------------------------------------------------------------- step 3: parsing

function ParseProgress({ jobId, onDone }: { jobId: string; onDone: (ok: boolean) => void }) {
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api<JobRead>(`/jobs/${jobId}`) });
  const finished = job.data ? TERMINAL_JOB_STATUSES.has(job.data.status) : false;
  const live = useLiveJob(jobId, Boolean(job.data) && !finished);
  const ok = job.data?.status === "succeeded" || job.data?.status === "partially_succeeded";
  useEffect(() => {
    if (finished) onDone(ok);
  }, [finished, ok, onDone]);
  if (job.isPending) return <Skeleton className="h-10" />;
  if (job.isError) return <p className="text-sm text-destructive">{errorMessage(job.error)}</p>;
  const j = job.data;
  if (finished && !ok)
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <div className="font-medium text-destructive">Reading the MEL {j.status === "cancelled" ? "was cancelled" : "failed"}</div>
        {j.error && <div>{String(j.error.message ?? "")}</div>}
      </div>
    );
  if (finished) return null;
  return (
    <div className="grid gap-2">
      <ProgressBar value={j.progress} label={j.stage ? humanize(j.stage) : j.status === "queued" ? "Waiting to start" : "Reading rows"} />
      {live && (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <Radio className="size-3.5 animate-pulse" /> Live
        </span>
      )}
    </div>
  );
}

function JobSummary({ jobId }: { jobId: string }) {
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api<JobRead>(`/jobs/${jobId}`), staleTime: Infinity });
  const r = (job.data?.result ?? null) as Record<string, unknown> | null;
  if (!r) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">{String(r.rows ?? 0)} rows read</Badge>
      <Badge variant="secondary">{String(r.categorised ?? 0)} categorised</Badge>
      <Badge variant="secondary">{String(r.vendors_matched ?? 0)} vendors matched</Badge>
      {Number(r.with_issues ?? 0) > 0 && <Badge variant="outline">{String(r.with_issues)} with issues</Badge>}
      {Number(r.duplicates ?? 0) > 0 && (
        <Badge variant="outline" title="Lines already recorded on this project (or repeated in the file). Approving one updates the recorded line instead of adding a copy.">
          {String(r.duplicates)} already recorded
        </Badge>
      )}
      {Number(r.sections ?? 0) > 0 && (
        <Badge variant="outline" title="Section headings (systems, packages, modules) label the rows below them; they aren't equipment">
          {String(r.sections)} section headings
        </Badge>
      )}
      {Number(r.skipped ?? 0) > 0 && (
        <Badge variant="outline" title="Lines with no tag and no description, such as deleted items">
          {String(r.skipped)} empty lines skipped
        </Badge>
      )}
      {Boolean(r.truncated) && <Badge variant="outline">Only the first rows were read</Badge>}
    </div>
  );
}

// ---------------------------------------------------------------- step 4: review

const STATUSES = ["pending", "approved", "rejected"] as const;
type RowStatus = (typeof STATUSES)[number];

function CategoryCell({ row, canFix, uploadId }: { row: MelRow; canFix: boolean; uploadId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const categories = useCategoryOptions(editing);
  const name = row.parsed.category_name as string | null | undefined;
  const code = row.parsed.category_code as string | null | undefined;
  const fix = useMutation({
    mutationFn: (category_code: string) => api<MelRow>(`/mel/rows/${row.id}`, { method: "PATCH", body: { category_code } }),
    onSuccess: (updated) => {
      queryClient.setQueriesData<MelRows>({ queryKey: ["mel-rows", uploadId] }, (old) =>
        old ? { ...old, rows: old.rows.map((r) => (r.id === updated.id ? updated : r)) } : old,
      );
      setEditing(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (editing)
    return (
      <div className="flex items-center gap-1">
        {categories.isPending ? (
          <Skeleton className="h-8 w-44" />
        ) : (
          <FilterSelect
            label={`Category for row ${row.row_number}`}
            anyLabel="Pick a category…"
            value={code ?? ""}
            onChange={(v) => v && fix.mutate(v)}
            options={categories.options}
            className="w-44"
          />
        )}
        <Button size="icon-xs" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)}>
          <X />
        </Button>
      </div>
    );
  return (
    <div className="flex items-start gap-1">
      <span className={cn("text-sm", !name && "text-muted-foreground")}>{name ?? "—"}</span>
      {canFix && categories.available && (
        <Button size="icon-xs" variant="ghost" aria-label={`Change category of row ${row.row_number}`} onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
      )}
    </div>
  );
}

function ReviewStep({ uploadId }: { uploadId: string }) {
  const queryClient = useQueryClient();
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const index = useAttributeIndex();
  const [status, setStatus] = useState<RowStatus>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(SHOW_STEP);
  const [verification, setVerification] = useState<"historical" | "verified">("historical");
  const rows = useQuery({
    queryKey: ["mel-rows", uploadId, status],
    queryFn: () => api<MelRows>(`/mel/${uploadId}/rows`, { query: { status } }),
  });
  const decide = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      const ids = [...selected];
      const total: MelDecisionResult = { approved: 0, rejected: 0, skipped: 0, vendors_linked: 0, updated: 0 };
      for (let i = 0; i < ids.length; i += BATCH) {
        const r = await api<MelDecisionResult>("/mel/rows/decide", {
          method: "POST",
          body: { row_ids: ids.slice(i, i + BATCH), decision, verification },
        });
        total.approved += r.approved;
        total.rejected += r.rejected;
        total.skipped += r.skipped;
        total.vendors_linked += r.vendors_linked;
        total.updated = (total.updated ?? 0) + (r.updated ?? 0);
      }
      return total;
    },
    onSuccess: (r) => {
      const parts = [
        r.approved && `${r.approved} approved`,
        r.updated && `${r.updated} updated existing lines`,
        r.rejected && `${r.rejected} rejected`,
        r.skipped && `${r.skipped} skipped`,
        r.vendors_linked && `${r.vendors_linked} vendors added to your list`,
      ].filter(Boolean);
      toast.success(parts.join(" · ") || "Nothing changed");
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["mel-rows", uploadId] });
      void queryClient.invalidateQueries({ queryKey: ["project-mels"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["procurement-records"] });
    },
  });

  const counts = rows.data?.counts ?? {};
  const items = rows.data?.rows ?? [];
  const visible = items.slice(0, shown);
  const allPicked = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const n = selected.size;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rows by status">
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? "default" : "outline"}
              onClick={() => {
                setStatus(s);
                setSelected(new Set());
                setShown(SHOW_STEP);
              }}
            >
              {humanize(s)} <span className="tabular-nums">{counts[s] ?? 0}</span>
            </Button>
          ))}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="Record approved rows as"
              anyLabel="Historical project data"
              value={verification === "historical" ? "" : verification}
              onChange={(v) => setVerification(v === "verified" ? "verified" : "historical")}
              options={[{ value: "verified", label: "Verified SPE data" }]}
              className="w-48"
            />
            <Button size="sm" disabled={n === 0 || decide.isPending} onClick={() => decide.mutate("approve")}>
              <Check /> Approve{n ? ` ${n}` : ""}
            </Button>
            <Button size="sm" variant="outline" disabled={n === 0 || decide.isPending} onClick={() => decide.mutate("reject")}>
              <X /> Reject{n ? ` ${n}` : ""}
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Select all shown rows"
                    checked={allPicked}
                    indeterminate={n > 0 && !allPicked}
                    onCheckedChange={(c) => setSelected(c ? new Set(visible.map((r) => r.id)) : new Set())}
                  />
                </TableHead>
              )}
              <TableHead className="w-12">Row</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Attributes</TableHead>
              <TableHead>Issues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.isPending && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {rows.isError && (
              <TableRow>
                <TableCell colSpan={8} className="whitespace-normal text-destructive">
                  {errorMessage(rows.error)}
                </TableCell>
              </TableRow>
            )}
            {rows.isSuccess && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center whitespace-normal text-muted-foreground">
                  No {status} rows.
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => {
              const p = r.parsed;
              const vendor = (p.vendor_name as string | undefined) ?? "";
              return (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  {canManage && (
                    <TableCell>
                      <Checkbox aria-label={`Select row ${r.row_number}`} checked={selected.has(r.id)} onCheckedChange={(c) => toggle(r.id, Boolean(c))} />
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground tabular-nums">{r.row_number}</TableCell>
                  <TableCell className="font-mono text-xs">{(p.tag as string) || "—"}</TableCell>
                  <TableCell className="max-w-48 text-sm whitespace-normal">
                    <div className="font-medium">{(p.name as string) || "—"}</div>
                    {Boolean(p.service) && <div className="text-xs text-muted-foreground">{String(p.service)}</div>}
                    {Boolean(p.system || p.condition) && (
                      <div className="text-xs text-muted-foreground">
                        {[p.system, p.condition].filter(Boolean).map(String).join(" · ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 whitespace-normal">
                    <CategoryCell row={r} uploadId={uploadId} canFix={canManage && r.status === "pending"} />
                  </TableCell>
                  <TableCell className="max-w-40 text-sm whitespace-normal">
                    {vendor || <span className="text-muted-foreground">—</span>}
                    {vendor && (
                      <div className={cn("text-xs", p.vendor_id ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                        {p.vendor_id ? "matched" : "not in knowledge base"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 text-xs whitespace-normal text-muted-foreground">
                    {attributeSummary(p.attributes as Record<string, unknown> | undefined, index, 6) || "—"}
                  </TableCell>
                  <TableCell className="max-w-48 whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {r.issues.map((i) => (
                        <span key={i} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">
                          {i}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {items.length > shown && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShown(shown + SHOW_STEP)}>
            Show more ({items.length - shown} left)
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the wizard

/** Upload a project's MEL, map its columns, read the rows in the background, then review and approve them
 *  into the project's equipment history. */
/** The MELs already on this project: pick one up for review from any browser. */
function ProjectMels({ projectId, onOpen }: { projectId: string; onOpen: (m: MelUploadSummary) => void }) {
  const mels = useQuery({
    queryKey: ["project-mels", projectId],
    queryFn: () => api<MelUploadSummary[]>(`/projects/${projectId}/mel`),
  });
  if (mels.isPending) return <Skeleton className="h-16" />;
  if (mels.isError) return <p className="text-sm text-destructive">{errorMessage(mels.error)}</p>;
  if (mels.data.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">MELs on this project</h3>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {mels.data.map((m) => {
              const c = m.counts ?? {};
              const parts = [
                c.pending && `${c.pending} pending`,
                c.approved && `${c.approved} approved`,
                c.rejected && `${c.rejected} rejected`,
              ].filter(Boolean);
              const state = !m.job_id ? "Not read yet" : m.job_status !== "succeeded" ? humanize(m.job_status ?? "") : null;
              return (
                <TableRow key={m.upload_id}>
                  <TableCell className="max-w-72 truncate font-medium" title={m.filename}>
                    {m.filename}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(m.uploaded_at)}</TableCell>
                  <TableCell className="text-sm">{state ?? (parts.join(" · ") || "No rows")}</TableCell>
                  <TableCell className="text-right">
                    {m.job_id && (
                      <Button size="sm" variant="outline" onClick={() => onOpen(m)}>
                        Open review
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function MelImport({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const [upload, setUpload] = useState<MelUpload | null>(null);
  const [session, setSessionState] = useState<Session | null>(() => loadSession(projectId));
  const [parsed, setParsed] = useState(false);
  const setSession = (s: Session | null) => {
    setSessionState(s);
    saveSession(projectId, s);
  };
  const reset = () => {
    setUpload(null);
    setParsed(false);
    setSession(null);
  };
  const onParsed = useCallback(
    (ok: boolean) => {
      setParsed(ok);
      if (ok) void queryClient.invalidateQueries({ queryKey: ["mel-rows"] });
    },
    [queryClient],
  );

  const step = session?.jobId ? "review" : upload && session ? "map" : "upload";
  const title = { upload: "Import the MEL", map: "Map the columns", review: "Review the rows" }[step];
  const description = {
    upload: "Bring in the project's Master Equipment List. Each approved row becomes an equipment line with its category, vendor and ratings.",
    map: `${upload?.filename ?? ""}: say what each column holds. Suggestions are pre-filled.`,
    review: `${session?.filename ?? ""}: fix categories where needed, then approve the rows to record them as this project's equipment.`,
  }[step];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {step !== "upload" && (
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw /> All MELs
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {step === "upload" &&
          (canManage ? (
            <UploadMel
              projectId={projectId}
              onUploaded={(u) => {
                setUpload(u);
                setParsed(false);
                setSession({ uploadId: u.upload_id, filename: u.filename, jobId: null });
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Only data administrators can import a MEL.</p>
          ))}
        {step === "upload" && (
          <ProjectMels
            projectId={projectId}
            onOpen={(m) => {
              setUpload(null);
              setParsed(false);
              setSession({ uploadId: m.upload_id, filename: m.filename, jobId: m.job_id ?? null });
            }}
          />
        )}
        {step === "map" && upload && session && (
          <MappingStep projectId={projectId} upload={upload} onStarted={(jobId) => setSession({ ...session, jobId })} />
        )}
        {step === "review" && session && (
          <>
            {session.jobId && <ParseProgress key={session.jobId} jobId={session.jobId} onDone={onParsed} />}
            {session.jobId && parsed && <JobSummary jobId={session.jobId} />}
            {(parsed || !session.jobId) && <ReviewStep uploadId={session.uploadId} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
