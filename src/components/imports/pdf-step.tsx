"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Play, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { JobAccepted, PdfCandidate, PdfImportRequest, PdfPreview, UploadRead, VendorPage, VendorSummary } from "@/lib/api/types";
import { humanize } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { OUTCOME_LABELS, countryName } from "@/lib/vendors";

type PdfVendor = NonNullable<PdfImportRequest["vendor"]>;

const KIND_TITLES: Record<string, string> = {
  equipment: "Equipment",
  services: "Services",
  certifications: "Certifications",
  industries: "Industries",
};

function ExistingVendorPicker({
  value,
  onChange,
}: {
  value: VendorSummary | null;
  onChange: (v: VendorSummary | null) => void;
}) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const results = useQuery({
    queryKey: ["vendors", "picker", debounced],
    queryFn: ({ signal }) => api<VendorPage>("/vendors", { query: { q: debounced, limit: 8 }, signal }),
    enabled: debounced.length >= 2,
  });
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <div>
          <div className="font-medium">{value.display_name}</div>
          <div className="text-xs text-muted-foreground">
            {[value.website?.replace(/^https?:\/\//, ""), countryName(value.hq_country)].filter((x) => x && x !== "—").join(" · ")}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Find the vendor" placeholder="Type a vendor name or website" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {results.data?.items.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v)}
          className="rounded-md border p-2 text-left text-sm hover:bg-muted"
        >
          <span className="font-medium">{v.display_name}</span>
          <span className="text-muted-foreground"> · {countryName(v.hq_country)}</span>
        </button>
      ))}
      {results.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No vendor found. Describe it as a new vendor instead.</p>}
    </div>
  );
}

function CandidateList({
  candidates,
  excluded,
  onToggle,
}: {
  candidates: PdfCandidate[];
  excluded: Set<string>;
  onToggle: (key: string, include: boolean) => void;
}) {
  const kinds = Object.keys(KIND_TITLES).filter((k) => candidates.some((c) => c.kind === k));
  if (!kinds.length) return <p className="text-sm text-muted-foreground">No equipment, services, certifications or industries were recognised in this document.</p>;
  return (
    <div className="grid gap-5">
      {kinds.map((kind) => (
        <div key={kind} className="grid gap-2">
          <h3 className="text-sm font-semibold">{KIND_TITLES[kind]}</h3>
          {candidates
            .filter((c) => c.kind === kind)
            .map((c) => (
              <Label key={c.key} className="flex items-start gap-3 rounded-md border p-3 font-normal">
                <Checkbox
                  aria-label={c.name}
                  className="mt-0.5"
                  checked={!excluded.has(c.key)}
                  onCheckedChange={(checked) => onToggle(c.key, Boolean(checked))}
                />
                <span className="grid min-w-0 gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Badge variant="outline">page {c.page}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(Number(c.confidence) * 100)}% · mentioned {c.occurrences}×
                    </span>
                  </span>
                  {Object.keys(c.details).length > 0 && (
                    <span className="text-xs">
                      {Object.entries(c.details)
                        .map(([k, v]) => `${humanize(k)}: ${String(v)}`)
                        .join(" · ")}
                    </span>
                  )}
                  <span className="text-xs break-words text-muted-foreground">“{c.snippet}”</span>
                </span>
              </Label>
            ))}
        </div>
      ))}
    </div>
  );
}

export function PdfStep({ upload, onStarted }: { upload: UploadRead; onStarted: () => void }) {
  const router = useRouter();
  const info = upload.pdf!;
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState(info.suggested_names[0] ?? "");
  const [website, setWebsite] = useState(info.suggested_domains[0] ?? "");
  const [country, setCountry] = useState("");
  const [existing, setExisting] = useState<VendorSummary | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const vendor: PdfVendor | null =
    mode === "existing"
      ? existing && { vendor_id: existing.id }
      : name.trim()
        ? { name: name.trim(), website: website.trim() || null, country: country.trim() || null }
        : null;
  // Debounce the serialised value: `vendor` is a new object on every render.
  const debouncedVendor = JSON.parse(useDebounced(JSON.stringify(vendor), 400)) as PdfVendor | null;

  const preview = useQuery({
    queryKey: ["pdf-preview", upload.id, debouncedVendor],
    queryFn: ({ signal }) =>
      api<PdfPreview>("/imports/pdf/preview", {
        method: "POST",
        body: { upload_id: upload.id, vendor: debouncedVendor },
        signal,
      }),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const candidates = preview.data?.candidates ?? [];
  const included = candidates.filter((c) => !excluded.has(c.key)).map((c) => c.key);

  const start = useMutation({
    mutationFn: () =>
      api<JobAccepted>("/imports/pdf", {
        method: "POST",
        body: { upload_id: upload.id, vendor, include: included },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: (job) => {
      onStarted();
      router.push(`/imports/${job.job_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const match = preview.data?.vendor;
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <div className="grid content-start gap-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>{upload.filename}</CardTitle>
            <CardDescription>
              {info.page_count} page{info.page_count === 1 ? "" : "s"}
              {info.pages_read < info.page_count && ` (first ${info.pages_read} read)`} · {info.facts_found} fact
              {info.facts_found === 1 ? "" : "s"} recognised
            </CardDescription>
          </CardHeader>
          {info.scanned && (
            <CardContent>
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                This PDF has little or no text, so it&apos;s probably scanned. Reading scanned documents (OCR) isn&apos;t supported yet.
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Whose document is this?</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
              <TabsList>
                <TabsTrigger value="new">Describe the vendor</TabsTrigger>
                <TabsTrigger value="existing">Pick an existing vendor</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === "existing" ? (
              <ExistingVendorPicker value={existing} onChange={setExisting} />
            ) : (
              <>
                <FormField id="pdf-name" label="Vendor name">
                  <Input id="pdf-name" value={name} onChange={(e) => setName(e.target.value)} />
                </FormField>
                {info.suggested_names.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {info.suggested_names.map((n) => (
                      <Button key={n} type="button" variant="outline" size="xs" onClick={() => setName(n)}>
                        {n}
                      </Button>
                    ))}
                  </div>
                )}
                <FormField id="pdf-website" label="Website" hint="The best way to recognise a vendor that's already known">
                  <Input id="pdf-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </FormField>
                {info.suggested_domains.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {info.suggested_domains.map((d) => (
                      <Button key={d} type="button" variant="outline" size="xs" onClick={() => setWebsite(d)}>
                        {d}
                      </Button>
                    ))}
                  </div>
                )}
                <FormField id="pdf-country" label="Country (optional)">
                  <Input id="pdf-country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </FormField>
              </>
            )}
            {match && vendor && (
              <div className="grid gap-1 rounded-md bg-muted p-3 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={match.outcome} />
                  <span>{OUTCOME_LABELS[match.outcome]}</span>
                </div>
                {match.messages.map((m) => (
                  <div key={m} className="text-xs text-muted-foreground">
                    {m}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="content-start xl:col-span-3">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="grid gap-1">
            <CardTitle>Facts found</CardTitle>
            <CardDescription>Untick anything that&apos;s wrong. The rest is sent for review with the page and text as evidence.</CardDescription>
          </div>
          <Button disabled={!vendor || start.isPending} onClick={() => start.mutate()}>
            <Play /> {start.isPending ? "Starting…" : `Import ${included.length} fact${included.length === 1 ? "" : "s"}`}
          </Button>
        </CardHeader>
        <CardContent>
          {preview.isPending && <Skeleton className="h-40" />}
          {preview.isError && <p className="text-sm text-destructive">{errorMessage(preview.error)}</p>}
          {preview.data && (
            <CandidateList
              candidates={candidates}
              excluded={excluded}
              onToggle={(key, include) =>
                setExcluded((s) => {
                  const next = new Set(s);
                  if (include) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
