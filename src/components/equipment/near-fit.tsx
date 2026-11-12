"use client";

import { useMutation } from "@tanstack/react-query";
import { Info, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { attributeLabel, defsForCategory, projectLabel, useAttributeDefs, useCategoryOptions } from "@/components/equipment/shared";
import { FilterSelect } from "@/components/filter-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerificationBadge } from "@/components/verification-badge";
import { api } from "@/lib/api/client";
import type { SimilarMatch, SimilarRequest, SimilarResult } from "@/lib/api/types";
import { attributeIndex, formatAttribute } from "@/lib/history";
import { errorMessage } from "@/lib/validation";

const MAX_ATTRS = 10;
const MAX_ESTIMATES = 5;
const ESTIMATE_LABEL = "Estimate — not verified vendor data";

/** How a match relates to the request (SOW 12): exact history, comparable reference or public catalogue data. */
function MatchKind({ m }: { m: SimilarMatch }) {
  if (m.source === "catalogue")
    return <span className="inline-flex rounded-full bg-slate-500/15 px-2 py-0.5 text-xs whitespace-nowrap text-slate-800 dark:text-slate-300">Catalogue (public data)</span>;
  if (m.match === "exact")
    return (
      <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs whitespace-nowrap text-emerald-800 dark:text-emerald-300">Exact historical match</span>
    );
  return <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-xs whitespace-nowrap text-sky-800 dark:text-sky-300">Comparable reference</span>;
}

interface TargetRow {
  key: string;
  value: string;
}

/** Find the organization's equipment (and optionally catalogue products) closest to a requested duty. */
export function NearFit() {
  const defs = useAttributeDefs();
  const index = attributeIndex(defs.data);
  const categories = useCategoryOptions();
  const [category, setCategory] = useState("");
  const [service, setService] = useState("");
  const [targets, setTargets] = useState<TargetRow[]>([{ key: "", value: "" }]);
  const [standards, setStandards] = useState("");
  const [estimate, setEstimate] = useState<string[]>([]);
  const [catalogue, setCatalogue] = useState(true);
  const numericDefs = defsForCategory(defs.data ?? [], category, "number");
  const usedKeys = new Set(targets.map((t) => t.key).filter(Boolean));

  const attributes: Record<string, number> = {};
  for (const t of targets) {
    const n = Number(t.value.replace(/,/g, ""));
    if (t.key && t.value.trim() !== "" && Number.isFinite(n)) attributes[t.key] = n;
  }
  const request: SimilarRequest = {
    category_code: category || null,
    service: service.trim(),
    attributes,
    standards: standards
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10),
    estimate: estimate.filter((k) => !(k in attributes)),
    include_catalogue: catalogue,
    limit: 20,
  };
  const run = useMutation({
    mutationFn: () => api<SimilarResult>("/equipment/similar", { method: "POST", body: request }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const ready = Boolean(category) || Object.keys(attributes).length > 0;
  const result = run.data;

  const setTarget = (i: number, patch: Partial<TargetRow>) => setTargets((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggleEstimate = (key: string, on: boolean) => {
    if (on && estimate.length >= MAX_ESTIMATES) {
      toast.error(`Up to ${MAX_ESTIMATES} values at a time`);
      return;
    }
    setEstimate((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Near-fit</CardTitle>
          <CardDescription>
            Describe the duty you need. We compare it with equipment from past projects and, optionally, vendors&apos; public catalogues, and can estimate missing values
            from the closest records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {categories.available && (
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <FilterSelect label="Category" anyLabel="Any category" value={category} onChange={setCategory} options={categories.options} className="w-full sm:w-96" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="nf-service">Service (optional)</Label>
            <Input
              id="nf-service"
              className="w-full sm:w-96"
              placeholder="e.g. seawater, crude oil, produced water"
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Required values</Label>
            {targets.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  label="Attribute"
                  anyLabel="Choose an attribute"
                  value={t.key}
                  onChange={(key) => setTarget(i, { key })}
                  options={numericDefs.filter((d) => d.key === t.key || !usedKeys.has(d.key)).map((d) => ({ value: d.key, label: attributeLabel(d, d.key) }))}
                  className="w-64"
                />
                <Input aria-label="Value" inputMode="decimal" placeholder="Value" className="w-32" value={t.value} onChange={(e) => setTarget(i, { value: e.target.value })} />
                {index[t.key]?.unit && <span className="text-sm text-muted-foreground">{index[t.key].unit}</span>}
                <Button variant="ghost" size="icon-sm" aria-label="Remove value" onClick={() => setTargets((rows) => rows.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={targets.length >= MAX_ATTRS || numericDefs.length === 0}
                onClick={() => setTargets((rows) => [...rows, { key: "", value: "" }])}
              >
                <Plus /> Add value
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nf-standards">Standards</Label>
            <Input id="nf-standards" placeholder="e.g. API 610, ATEX (comma-separated)" className="sm:w-96" value={standards} onChange={(e) => setStandards(e.target.value)} />
          </div>
          {numericDefs.length > 0 && (
            <div className="grid gap-2">
              <Label>Estimate these values (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Interpolated from the closest historical records. Estimates are ideas to check, never verified vendor data. Up to {MAX_ESTIMATES}.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {numericDefs
                  .filter((d) => !(d.key in attributes))
                  .map((d) => (
                    <Label key={d.key} className="flex items-center gap-2 font-normal">
                      <Checkbox aria-label={`Estimate ${d.label}`} checked={estimate.includes(d.key)} onCheckedChange={(c) => toggleEstimate(d.key, Boolean(c))} />
                      {attributeLabel(d, d.key)}
                    </Label>
                  ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox aria-label="Include catalogue products" checked={catalogue} onCheckedChange={(c) => setCatalogue(Boolean(c))} />
              Also compare vendors&apos; catalogue products (public data)
            </Label>
            <Button className="ml-auto" disabled={!ready || run.isPending} onClick={() => run.mutate()}>
              <Sparkles /> {run.isPending ? "Comparing…" : "Find near-fit"}
            </Button>
          </div>
          {!ready && <p className="text-xs text-muted-foreground">Choose a category or enter at least one value.</p>}
        </CardContent>
      </Card>

      {result && (
        <>
          <Alert>
            <Info />
            <AlertDescription>{result.notice}</AlertDescription>
          </Alert>

          {result.estimates.length > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle>Estimates</CardTitle>
                <CardDescription>Calculated from historical records. Check every value with the vendor before use.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {result.estimates.map((e) => (
                  <div key={e.key} className="grid gap-1 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{e.label}</span>
                      <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs whitespace-nowrap text-amber-800 dark:text-amber-300">{ESTIMATE_LABEL}</span>
                    </div>
                    <div className="text-lg tabular-nums">≈ {formatAttribute(e.value, e.unit)}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.method === "interpolated" ? "Interpolated" : e.method === "extrapolated" ? "Extrapolated (outside the recorded range)" : "Nearest record"}
                      {e.driver ? ` from ${index[e.driver]?.label ?? e.driver}` : ""}
                      {e.basis.length > 0 ? ` · based on ${e.basis.join(", ")}` : ""}
                    </div>
                    {e.label_note && <div className="text-xs text-amber-800 dark:text-amber-300">{e.label_note}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Differences</TableHead>
                  <TableHead>Verification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.matches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center whitespace-normal text-muted-foreground">
                      Nothing close enough on record. Try a broader category or fewer values.
                    </TableCell>
                  </TableRow>
                )}
                {result.matches.map((m, i) => (
                  <TableRow key={m.equipment_id ?? m.product_id ?? i}>
                    <TableCell>
                      <MatchKind m={m} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(m.score * 100)}%</TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {m.equipment_id ? (
                        <Link href={`/equipment/${m.equipment_id}`} className="font-medium hover:underline">
                          {m.name || "Untitled"}
                        </Link>
                      ) : (
                        <span className="font-medium">{m.name || "Untitled"}</span>
                      )}
                      <div className="text-xs text-muted-foreground">{[m.model, m.category_name].filter(Boolean).join(" · ")}</div>
                      {m.standards.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.standards.slice(0, 4).map((s) => (
                            <Badge key={s} variant="outline">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.vendor_id ? (
                        <Link href={`/vendors/${m.vendor_id}`} className="hover:underline">
                          {m.vendor_name || "—"}
                        </Link>
                      ) : (
                        m.vendor_name || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{m.project ? projectLabel(m.project) : "—"}</TableCell>
                    <TableCell className="max-w-80 text-xs whitespace-normal">
                      {m.diffs.length === 0
                        ? "—"
                        : m.diffs.map((d) => (
                            <div key={d.key}>
                              <span className="text-muted-foreground">{index[d.key]?.label ?? d.key}:</span> {formatAttribute(d.found, index[d.key]?.unit)}{" "}
                              <span className="text-muted-foreground">({d.note})</span>
                            </div>
                          ))}
                    </TableCell>
                    <TableCell>
                      <VerificationBadge value={m.verification} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
