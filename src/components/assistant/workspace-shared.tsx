"use client";

import { useQueries } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { DimensionScores, SearchIntent, ShortlistRow, VendorDetail } from "@/lib/api/types";

export type Dim = keyof DimensionScores;

/** The ranking dimensions the assistant scores (0-1 each), with default weights. */
export const DIMS: { key: Dim; label: string; weight: number }[] = [
  { key: "equipment", label: "Equipment match", weight: 30 },
  { key: "standards", label: "Standards & certifications", weight: 20 },
  { key: "relevance", label: "Relevance to the question", weight: 15 },
  { key: "industry", label: "Industry experience", weight: 10 },
  { key: "track_record", label: "Track record", weight: 10 },
  { key: "data_quality", label: "Data completeness", weight: 10 },
  { key: "approved_vendor", label: "Approved vendor (AVL)", weight: 5 },
];

export type Weights = Record<Dim, number>;
export const DEFAULT_WEIGHTS = Object.fromEntries(DIMS.map((d) => [d.key, d.weight])) as Weights;

/** Dimensions the request asked about: any vendor has a score for it (track record, completeness and AVL always). */
export function activeDims(rows: ShortlistRow[]): typeof DIMS {
  return DIMS.filter((d) => rows.some((r) => r.scores[d.key] !== null && r.scores[d.key] !== undefined));
}

/** 0-10 weighted score over the active dimensions; a dimension a vendor has no score for counts as 0. */
export function score(row: ShortlistRow, weights: Weights, dims: typeof DIMS): number {
  const total = dims.reduce((sum, d) => sum + weights[d.key], 0);
  if (!total) return 0;
  const got = dims.reduce((sum, d) => sum + weights[d.key] * (row.scores[d.key] ?? 0), 0);
  return Math.round((got / total) * 100) / 10;
}

export interface Ranked extends ShortlistRow {
  score: number;
  rank: number;
}

export function rank(rows: ShortlistRow[], weights: Weights): Ranked[] {
  const dims = activeDims(rows);
  return rows
    .map((r) => ({ ...r, score: score(r, weights, dims), rank: 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** "pumps.centrifugal.api610.bb2" -> "BB2"; longer last parts are humanized ("ball_valves" -> "Ball valves"). */
export function codeLabel(code: string): string {
  const last = code.split(".").at(-1) ?? code;
  return last.length <= 4 ? last.toUpperCase() : (last.charAt(0).toUpperCase() + last.slice(1)).replace(/_/g, " ");
}

const squash = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");

/** The requirement with every list present (the API may leave empty ones out). A certification that only restates a
 *  requested standard ("API 610" and the API_610 certificate) is the same requirement, so it's left out. */
export function fullIntent(req: SearchIntent | null | undefined): Required<SearchIntent> | null {
  if (!req) return null;
  const standards = (req.standards ?? []).map(squash);
  return {
    equipment_categories: req.equipment_categories ?? [],
    service_categories: req.service_categories ?? [],
    industries: req.industries ?? [],
    certifications: (req.certifications ?? []).filter((c) => !standards.some((s) => s && squash(c).includes(s))),
    standards: req.standards ?? [],
    countries: req.countries ?? [],
    keywords: req.keywords ?? "",
  };
}

export function requirementChips(intent: SearchIntent | null | undefined): { label: string; value: string }[] {
  const req = fullIntent(intent);
  if (!req) return [];
  return [
    ...req.equipment_categories.map((c) => ({ label: "Equipment", value: codeLabel(c) })),
    ...req.service_categories.map((c) => ({ label: "Service", value: codeLabel(c) })),
    ...req.standards.map((s) => ({ label: "Standard", value: s })),
    ...req.certifications.map((c) => ({ label: "Certification", value: codeLabel(c) })),
    ...req.industries.map((c) => ({ label: "Industry", value: codeLabel(c) })),
    ...req.countries.map((c) => ({ label: "Country", value: c })),
    ...(req.keywords ? [{ label: "Keywords", value: req.keywords }] : []),
  ];
}

/** Full records of the shortlisted vendors (shared cache with the vendor pages). */
export function useVendorDetails(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["vendor", id],
      queryFn: () => api<VendorDetail>(`/vendors/${id}`),
      staleTime: 60_000,
    })),
    combine: (results) => ({
      byId: Object.fromEntries(results.flatMap((r) => (r.data ? [[r.data.id, r.data] as const] : []))) as Record<string, VendorDetail>,
      loading: results.some((r) => r.isPending),
    }),
  });
}

export function tone(value: number): string {
  return value >= 0.7 ? "bg-emerald-500" : value >= 0.4 ? "bg-amber-500" : "bg-red-500";
}

export function Bar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`block h-1.5 overflow-hidden rounded-full bg-muted ${className}`}>
      <span className={`block h-full rounded-full ${tone(value)}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

export function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "ok" }) {
  const cls =
    tone === "warn"
      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
      : tone === "ok"
        ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
        : "bg-muted text-foreground";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

export function Panel({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
