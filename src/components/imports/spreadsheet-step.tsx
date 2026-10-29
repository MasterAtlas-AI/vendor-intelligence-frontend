"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { FormField } from "@/components/form-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { AvlStatus, ImportPreview, ImportRequest, JobAccepted, UploadRead } from "@/lib/api/types";
import { errorMessage } from "@/lib/validation";
import { AVL_OPTIONS, OUTCOME_LABELS } from "@/lib/vendors";

// Mirrors FIELD_SYNONYMS in the backend (app/modules/imports/spreadsheet.py).
const FIELD_GROUPS: { title: string; hint: string; fields: { key: string; label: string }[] }[] = [
  {
    title: "Vendor",
    hint: "Used to find the vendor in the knowledge base, or to propose it.",
    fields: [
      { key: "name", label: "Vendor name (required)" },
      { key: "website", label: "Website" },
      { key: "country", label: "Country" },
      { key: "city", label: "City" },
      { key: "description", label: "Description" },
      { key: "aliases", label: "Other names" },
    ],
  },
  {
    title: "Capabilities",
    hint: "Matched to the taxonomy; lists may be separated by ; , | or new lines.",
    fields: [
      { key: "equipment", label: "Equipment / products" },
      { key: "services", label: "Services" },
      { key: "certifications", label: "Certifications" },
      { key: "industries", label: "Industries" },
    ],
  },
  {
    title: "Your organization only",
    hint: "Private to your organization; never shared.",
    fields: [
      { key: "internal_code", label: "Your vendor code" },
      { key: "avl_status", label: "Approval (AVL) status" },
      { key: "tags", label: "Tags" },
      { key: "notes", label: "Notes" },
    ],
  },
];

function columnLetter(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const NOT_MAPPED = "-1";

export function SpreadsheetStep({ upload, onStarted }: { upload: UploadRead; onStarted: () => void }) {
  const router = useRouter();
  const sheets = upload.sheets ?? [];
  const [sheetName, setSheetName] = useState(sheets[0]?.name ?? "");
  const sheet = sheets.find((s) => s.name === sheetName) ?? sheets[0]!;
  const [headerRow, setHeaderRow] = useState(sheet.header_row);
  const [mapping, setMapping] = useState<Record<string, number>>(sheet.suggested_mapping);
  const [defaultAvl, setDefaultAvl] = useState("");
  const [tags, setTags] = useState("");

  const request: ImportRequest = useMemo(
    () => ({
      upload_id: upload.id,
      sheet: sheet.name,
      header_row: headerRow,
      mapping,
      options: {
        default_avl_status: (defaultAvl || null) as AvlStatus | null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      },
    }),
    [upload.id, sheet.name, headerRow, mapping, defaultAvl, tags],
  );

  const preview = useQuery({
    queryKey: ["import-preview", request],
    queryFn: ({ signal }) => api<ImportPreview>("/imports/excel/preview", { method: "POST", body: request, signal }),
    enabled: mapping.name !== undefined && headerRow >= 1,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const start = useMutation({
    mutationFn: () =>
      api<JobAccepted>("/imports/excel", {
        method: "POST",
        body: request,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: (job) => {
      onStarted();
      router.push(`/imports/${job.job_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const headers = preview.data?.headers ?? sheet.headers;
  const columnItems: Record<string, string> = {
    [NOT_MAPPED]: "Not mapped",
    ...Object.fromEntries(headers.map((h, i) => [String(i), `${columnLetter(i)} · ${h}`])),
  };

  function setColumn(field: string, value: string) {
    setMapping((m) => {
      const next = { ...m };
      delete next[field];
      if (value !== NOT_MAPPED) {
        // A column feeds one field only: take it away from any other field first.
        for (const [f, i] of Object.entries(next)) if (String(i) === value) delete next[f];
        next[field] = Number(value);
      }
      return next;
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <div className="grid content-start gap-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>{upload.filename}</CardTitle>
            <CardDescription>
              {sheet.data_rows} row{sheet.data_rows === 1 ? "" : "s"} below the header
              {sheet.truncated && " (only the first rows are imported; split larger files)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {sheets.length > 1 && (
              <FormField id="import-sheet" label="Sheet">
                <Select
                  items={Object.fromEntries(sheets.map((s) => [s.name, s.name]))}
                  value={sheet.name}
                  onValueChange={(v) => {
                    const next = sheets.find((s) => s.name === v);
                    if (!next) return;
                    setSheetName(next.name);
                    setHeaderRow(next.header_row);
                    setMapping(next.suggested_mapping);
                  }}
                >
                  <SelectTrigger id="import-sheet" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <FormField id="import-header-row" label="Header row" hint="The row holding the column names">
              <Input
                id="import-header-row"
                type="number"
                min={1}
                max={50}
                value={headerRow}
                onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
              />
            </FormField>
          </CardContent>
        </Card>

        {FIELD_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.hint}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {group.fields.map((f) => (
                <div key={f.key} className="grid grid-cols-[10rem_1fr] items-center gap-3">
                  <span className="text-sm">{f.label}</span>
                  <Select
                    items={columnItems}
                    value={mapping[f.key] !== undefined ? String(mapping[f.key]) : NOT_MAPPED}
                    onValueChange={(v) => setColumn(f.key, String(v ?? NOT_MAPPED))}
                  >
                    <SelectTrigger aria-label={`Column for ${f.label}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(columnItems).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Defaults</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
              <span className="text-sm">AVL status when blank</span>
              <FilterSelect
                label="AVL status when blank"
                anyLabel="Leave unchanged"
                value={defaultAvl}
                onChange={setDefaultAvl}
                options={AVL_OPTIONS}
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
              <label htmlFor="import-tags" className="text-sm">
                Tag every vendor
              </label>
              <Input id="import-tags" placeholder="e.g. import-2026, rotating" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="content-start xl:col-span-3">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="grid gap-1">
            <CardTitle>Preview</CardTitle>
            <CardDescription>What the import will do with the first {preview.data?.rows.length ?? 20} rows. Nothing is saved yet.</CardDescription>
          </div>
          <Button disabled={mapping.name === undefined || preview.isError || start.isPending} onClick={() => start.mutate()}>
            <Play /> {start.isPending ? "Starting…" : `Import ${preview.data?.data_rows ?? sheet.data_rows} rows`}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {mapping.name === undefined && (
            <p className="text-sm text-muted-foreground">Choose the column that holds the vendor name to see a preview.</p>
          )}
          {preview.isError && <p className="text-sm text-destructive">{errorMessage(preview.error)}</p>}
          {preview.data && (
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(preview.data.predicted).map(([outcome, n]) => (
                <span key={outcome} className="inline-flex items-center gap-1.5">
                  <StatusBadge status={outcome} /> {n}
                </span>
              ))}
            </div>
          )}
          {preview.isFetching && !preview.data && <Skeleton className="h-40" />}
          {preview.data && (
            <div className={preview.isFetching ? "opacity-60 transition-opacity" : undefined}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.data.rows.map((r) => (
                    <TableRow key={r.row_number}>
                      <TableCell className="text-muted-foreground tabular-nums">{r.row_number}</TableCell>
                      <TableCell className="font-medium">{r.values.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <span title={OUTCOME_LABELS[r.outcome]}>
                          <StatusBadge status={r.outcome} />
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md text-xs whitespace-normal text-muted-foreground">
                        {r.messages.join(" · ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
