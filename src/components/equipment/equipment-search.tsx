"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Columns3, Download, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CodePicker } from "@/components/code-picker";
import { COMPARE_MAX, EquipmentCompare } from "@/components/equipment/equipment-compare";
import { attributeLabel, attributeSummary, defsForCategory, downloadText, equipmentCsv, projectLabel, useAttributeDefs, useCategoryOptions, useProjects } from "@/components/equipment/shared";
import { FilterSelect } from "@/components/filter-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerificationBadge } from "@/components/verification-badge";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { Equipment, EquipmentPage, EquipmentSearch as SearchBody, SavedSearch, VendorDetail, VendorPage, Verification } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { DEPARTMENTS, EQUIPMENT_STATUSES, VERIFICATION, attributeIndex, equipmentStatusLabel } from "@/lib/history";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

const PAGE = 50;
const EXPORT_MAX = 500;

/** One numeric range filter row; min/max kept as text while typing. */
interface RangeRow {
  key: string;
  min: string;
  max: string;
}

/** Everything a saved search stores (besides the free-text query). */
interface Filters {
  project_ids: string[];
  category_code: string;
  countries: string[];
  facility_types: string[];
  location: string;
  year_from: string;
  year_to: string;
  standard: string;
  material: string;
  verification: string[];
  department: string;
  vendor_id: string; // supplied or made (OEM) by this vendor
  service: string;
  statuses: string[];
  ranges: RangeRow[];
  include_archived: boolean;
}

const EMPTY: Filters = {
  project_ids: [],
  category_code: "",
  countries: [],
  facility_types: [],
  location: "",
  year_from: "",
  year_to: "",
  standard: "",
  material: "",
  verification: [],
  department: "",
  vendor_id: "",
  service: "",
  statuses: [],
  ranges: [],
  include_archived: false,
};

const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Restores filters from a saved search, tolerating older or partial shapes. */
function fromSaved(f: Record<string, unknown>): Filters {
  const ranges: RangeRow[] = [];
  if (f.ranges && typeof f.ranges === "object" && !Array.isArray(f.ranges)) {
    for (const [key, pair] of Object.entries(f.ranges as Record<string, unknown>)) {
      const [lo, hi] = Array.isArray(pair) ? pair : [];
      ranges.push({ key, min: text(lo), max: text(hi) });
    }
  }
  return {
    project_ids: strings(f.project_ids),
    category_code: text(f.category_code),
    countries: strings(f.countries),
    facility_types: strings(f.facility_types),
    location: text(f.location),
    year_from: text(f.year_from),
    year_to: text(f.year_to),
    standard: text(f.standard),
    material: text(f.material),
    verification: strings(f.verification),
    department: text(f.department),
    vendor_id: text(f.vendor_id),
    service: text(f.service),
    statuses: strings(f.statuses),
    ranges,
    include_archived: f.include_archived === true,
  };
}

/** The API body (minus q/limit/offset) for the current filters. */
function toBody(f: Filters): Omit<SearchBody, "q" | "limit" | "offset"> {
  const ranges: Record<string, (number | null)[]> = {};
  for (const r of f.ranges) {
    const lo = num(r.min);
    const hi = num(r.max);
    if (r.key && (lo !== null || hi !== null)) ranges[r.key] = [lo, hi];
  }
  return {
    project_ids: f.project_ids,
    category_code: f.category_code || null,
    countries: f.countries,
    facility_types: f.facility_types,
    location: (f.location || null) as SearchBody["location"],
    year_from: num(f.year_from),
    year_to: num(f.year_to),
    standard: f.standard.trim() || null,
    material: f.material.trim() || null,
    verification: f.verification as Verification[],
    department: (f.department || null) as SearchBody["department"],
    vendor_id: f.vendor_id || null,
    service: f.service.trim(),
    statuses: f.statuses as SearchBody["statuses"],
    ranges,
    include_archived: f.include_archived,
  };
}

function activeCount(f: Filters): number {
  const b = toBody(f);
  return [
    b.project_ids?.length,
    b.category_code,
    b.countries?.length,
    b.facility_types?.length,
    b.location,
    b.year_from !== null,
    b.year_to !== null,
    b.standard,
    b.material,
    b.verification?.length,
    b.department,
    b.vendor_id,
    b.service,
    b.statuses?.length,
    Object.keys(b.ranges ?? {}).length,
    b.include_archived,
  ].filter(Boolean).length;
}

function SaveSearchDialog({ open, onOpenChange, q, filters }: { open: boolean; onOpenChange: (o: boolean) => void; q: string; filters: Filters }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api<SavedSearch>("/saved-searches", {
        method: "POST",
        body: { kind: "equipment", name: name.trim(), query: q, filters: toBody(filters) },
      }),
    onSuccess: () => {
      toast.success("Search saved");
      setName("");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["saved-searches", "equipment"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save this search</DialogTitle>
          <DialogDescription>Keeps the search text and every filter so you can run it again later.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="saved-search-name">Name</Label>
          <Input id="saved-search-name" placeholder="e.g. Offshore seawater lift pumps > 1,000 m3/h" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pick a vendor or OEM to filter by (matches lines it supplied or manufactured). */
function VendorFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [term, setTerm] = useState("");
  const q = useDebounced(term.trim(), 250);
  const found = useQuery({
    queryKey: ["vendors", "pick", q],
    queryFn: ({ signal }) => api<VendorPage>("/vendors", { query: { q, limit: 8 }, signal }),
    enabled: q.length >= 2 && !value,
  });
  const chosen = useQuery({
    queryKey: ["vendor", value],
    queryFn: () => api<VendorDetail>(`/vendors/${value}`),
    enabled: Boolean(value),
    staleTime: 300_000,
  });
  if (value)
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border px-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{chosen.data?.display_name ?? "Selected vendor"}</span>
        <Button size="icon-xs" variant="ghost" aria-label="Clear vendor filter" onClick={() => onChange("")}>
          <X />
        </Button>
      </div>
    );
  return (
    <div className="relative">
      <Input aria-label="Vendor or OEM" placeholder="Type a vendor or manufacturer" value={term} onChange={(e) => setTerm(e.target.value)} />
      {q.length >= 2 && (found.data?.items.length ?? 0) > 0 && (
        <div className="absolute z-20 mt-1 grid w-full rounded-md border bg-popover p-1 shadow-md">
          {found.data!.items.map((v) => (
            <button
              key={v.id}
              type="button"
              className="truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onChange(v.id);
                setTerm("");
              }}
            >
              {v.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Search the organization's own equipment history (project MELs) with filters, saved searches and CSV export. */
export function EquipmentSearch() {
  const canExport = useCan(P.DATA_EXPORT);
  const canSave = useCan(P.SEARCH_RUN);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  // The category browser links here as /equipment?category=<code>; follow it when the link changes too.
  const urlCategory = useSearchParams().get("category") ?? "";
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, category_code: urlCategory }));
  const [seenCategory, setSeenCategory] = useState(urlCategory);
  if (urlCategory !== seenCategory) {
    setSeenCategory(urlCategory);
    setFilters((f) => ({ ...f, category_code: urlCategory }));
  }
  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Kept across pages and filter changes so records from different searches can be compared.
  const [selected, setSelected] = useState<Equipment[]>([]);
  const [comparing, setComparing] = useState(false);
  const isSelected = (id: string) => selected.some((s) => s.id === id);
  const toggle = (e: Equipment, on: boolean) => setSelected((s) => (on ? (s.length >= COMPARE_MAX || s.some((x) => x.id === e.id) ? s : [...s, e]) : s.filter((x) => x.id !== e.id)));
  const body = toBody(filters);
  // Debounced as a string: the body is a new object every render, which would never settle.
  const bodyKey = useDebounced(JSON.stringify(body), 300);
  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
  };

  const defs = useAttributeDefs();
  const index = attributeIndex(defs.data);
  const numericDefs = defsForCategory(defs.data ?? [], filters.category_code, "number");
  const categories = useCategoryOptions();
  const projects = useProjects();
  const projectList = projects.data ?? [];
  const countries = [...new Set(projectList.map((p) => p.country).filter((c): c is string => Boolean(c)))].sort();
  const facilities = [...new Set(projectList.map((p) => p.facility_type).filter((c): c is string => Boolean(c)))].sort();

  const results = useQuery({
    queryKey: ["equipment", "search", q, bodyKey, offset],
    queryFn: () => api<EquipmentPage>("/equipment/search", { method: "POST", body: { ...(JSON.parse(bodyKey) as typeof body), q, limit: PAGE, offset } }),
    placeholderData: (previous) => previous,
  });
  const saved = useQuery({
    queryKey: ["saved-searches", "equipment"],
    queryFn: () => api<SavedSearch[]>("/saved-searches", { query: { kind: "equipment" } }),
    enabled: canSave,
  });
  const removeSaved = useMutation({
    mutationFn: (id: string) => api(`/saved-searches/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-searches", "equipment"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const applySaved = (s: SavedSearch) => {
    setSearch(s.query);
    setFilters(fromSaved(s.filters));
    setOffset(0);
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api<EquipmentPage>("/equipment/search", { method: "POST", body: { ...body, q: search.trim(), limit: EXPORT_MAX, offset: 0 } });
      downloadText("equipment-history.csv", equipmentCsv(all.items, index));
      if (all.total > all.items.length) toast.info(`Exported the first ${all.items.length} of ${all.total.toLocaleString()} records. Narrow the filters to export the rest.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const page = results.data;
  const rows = page?.items ?? [];
  const total = page?.total ?? 0;
  const filtered = activeCount(filters) > 0 || Boolean(q);

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search equipment"
                placeholder="Tag, description, service, model or vendor"
                className="pl-8"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
            {canSave && (
              <Button variant="outline" onClick={() => setSaving(true)} disabled={!filtered}>
                <Bookmark /> Save search
              </Button>
            )}
            {canExport && (
              <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || total === 0}>
                <Download /> {exporting ? "Exporting…" : "Export CSV"}
              </Button>
            )}
            {filtered && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  update(EMPTY);
                }}
              >
                <X /> Clear
              </Button>
            )}
          </div>
          {canSave && (saved.data?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Saved:</span>
              {saved.data?.map((s) => (
                <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
                  <button type="button" className="hover:underline" onClick={() => applySaved(s)} title={s.query || undefined}>
                    {s.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved search ${s.name}`}
                    className="rounded-full p-0.5 hover:bg-muted"
                    disabled={removeSaved.isPending}
                    onClick={() => removeSaved.mutate(s.id)}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.available && (
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <FilterSelect
                  label="Category"
                  anyLabel="Any category"
                  value={filters.category_code}
                  onChange={(v) => update({ category_code: v })}
                  options={categories.options}
                  className="w-full"
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Projects</Label>
              <CodePicker
                label="Projects"
                placeholder="Any project"
                options={projectList.map((p) => ({ value: p.id, label: p.year ? `${p.name} (${p.year})` : p.name }))}
                value={filters.project_ids}
                onChange={(v) => update({ project_ids: v })}
                max={50}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Project country</Label>
              <CodePicker
                label="Project country"
                placeholder="Any country"
                options={countries.map((c) => ({ value: c, label: countryName(c) }))}
                value={filters.countries}
                onChange={(v) => update({ countries: v })}
                max={30}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Facility type</Label>
              <CodePicker
                label="Facility type"
                placeholder="Any facility"
                options={facilities.map((c) => ({ value: c, label: c }))}
                value={filters.facility_types}
                onChange={(v) => update({ facility_types: v })}
                max={20}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Location</Label>
              <FilterSelect
                label="Location"
                anyLabel="Offshore or onshore"
                value={filters.location}
                onChange={(v) => update({ location: v })}
                options={[
                  { value: "offshore", label: "Offshore" },
                  { value: "onshore", label: "Onshore" },
                ]}
                className="w-full"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Project year</Label>
              <div className="flex items-center gap-2">
                <Input aria-label="From year" inputMode="numeric" placeholder="From" value={filters.year_from} onChange={(e) => update({ year_from: e.target.value })} />
                <span className="text-muted-foreground">–</span>
                <Input aria-label="To year" inputMode="numeric" placeholder="To" value={filters.year_to} onChange={(e) => update({ year_to: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-standard">Standard</Label>
              <Input id="eq-standard" placeholder="e.g. API 610" value={filters.standard} onChange={(e) => update({ standard: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-material">Material</Label>
              <Input id="eq-material" placeholder="e.g. Duplex" value={filters.material} onChange={(e) => update({ material: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Vendor / OEM</Label>
              <VendorFilter value={filters.vendor_id} onChange={(vendor_id) => update({ vendor_id })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-service">Service</Label>
              <Input id="eq-service" placeholder="e.g. seawater, crude, produced water" value={filters.service} onChange={(e) => update({ service: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Equipment status</Label>
              <CodePicker
                label="Equipment status"
                placeholder="Any status"
                options={EQUIPMENT_STATUSES.map(([value, label]) => ({ value, label }))}
                value={filters.statuses}
                onChange={(statuses) => update({ statuses })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Department</Label>
              <FilterSelect
                label="Department"
                anyLabel="Any department"
                value={filters.department}
                onChange={(v) => update({ department: v })}
                options={DEPARTMENTS.map(([value, label]) => ({ value, label }))}
                className="w-full"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Verification</Label>
              <CodePicker
                label="Verification"
                placeholder="Any verification status"
                options={Object.entries(VERIFICATION).map(([value, v]) => ({ value, label: v.label }))}
                value={filters.verification}
                onChange={(v) => update({ verification: v })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label>Technical ranges</Label>
              <span className="text-xs text-muted-foreground">Values in the attribute&apos;s unit; leave a side empty for no limit.</span>
            </div>
            {filters.ranges.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  label="Attribute"
                  anyLabel="Choose an attribute"
                  value={r.key}
                  onChange={(key) => update({ ranges: filters.ranges.map((x, j) => (j === i ? { ...x, key } : x)) })}
                  options={numericDefs.map((d) => ({ value: d.key, label: attributeLabel(d, d.key) }))}
                  className="w-64"
                />
                <Input
                  aria-label="Minimum"
                  inputMode="decimal"
                  placeholder="Min"
                  className="w-28"
                  value={r.min}
                  onChange={(e) => update({ ranges: filters.ranges.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)) })}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  aria-label="Maximum"
                  inputMode="decimal"
                  placeholder="Max"
                  className="w-28"
                  value={r.max}
                  onChange={(e) => update({ ranges: filters.ranges.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)) })}
                />
                {index[r.key]?.unit && <span className="text-sm text-muted-foreground">{index[r.key].unit}</span>}
                <Button variant="ghost" size="icon-sm" aria-label="Remove range" onClick={() => update({ ranges: filters.ranges.filter((_, j) => j !== i) })}>
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.ranges.length >= 10 || numericDefs.length === 0}
                onClick={() => update({ ranges: [...filters.ranges, { key: "", min: "", max: "" }] })}
              >
                <Plus /> Add range
              </Button>
              <Label className="flex items-center gap-2 font-normal text-muted-foreground">
                <Checkbox aria-label="Include archived records" checked={filters.include_archived} onCheckedChange={(c) => update({ include_archived: Boolean(c) })} />
                Include archived records
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {results.isError && <p className="text-sm text-destructive">{errorMessage(results.error)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {page ? (total === 0 ? "No records" : `${(offset + 1).toLocaleString()}–${(offset + rows.length).toLocaleString()} of ${total.toLocaleString()} records`) : "Searching…"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {selected.length > 0 && (
            <>
              <Button size="sm" disabled={selected.length < 2} onClick={() => setComparing(true)} title={selected.length < 2 ? "Select at least two records to compare" : undefined}>
                <Columns3 /> Compare ({selected.length})
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Clear selection
              </Button>
            </>
          )}
          {total > PAGE && (
            <>
              <Button variant="outline" size="sm" disabled={offset === 0 || results.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + PAGE >= total || results.isFetching} onClick={() => setOffset(offset + PAGE)}>
                Next
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <span className="sr-only">Select to compare</span>
              </TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Vendor / model</TableHead>
              <TableHead>Key data</TableHead>
              <TableHead>Verification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.isPending && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {page && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center whitespace-normal text-muted-foreground">
                  {filtered ? "No equipment matches these filters." : "No equipment history yet. Import a project's MEL to build it."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((e) => (
              <TableRow key={e.id} data-state={isSelected(e.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${e.name || e.tag || "record"} to compare`}
                    checked={isSelected(e.id)}
                    disabled={!isSelected(e.id) && selected.length >= COMPARE_MAX}
                    title={!isSelected(e.id) && selected.length >= COMPARE_MAX ? `Compare up to ${COMPARE_MAX} records` : undefined}
                    onCheckedChange={(c) => toggle(e, Boolean(c))}
                  />
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  <Link href={`/equipment/${e.id}`} className="font-medium hover:underline">
                    {e.name || e.tag || "Untitled"}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {[e.tag, e.service, e.quantity > 1 ? `× ${e.quantity}` : ""].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{e.category_name ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {projectLabel(e.project)}
                  <div className="text-xs text-muted-foreground">
                    {[countryName(e.project.country), e.project.location, e.status ? equipmentStatusLabel(e.status) : ""].filter((x) => x && x !== "—").join(" · ")}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {e.vendor_id ? (
                    <Link href={`/vendors/${e.vendor_id}`} className="hover:underline">
                      {e.vendor_name || "—"}
                    </Link>
                  ) : (
                    e.vendor_name || "—"
                  )}
                  <div className="text-xs text-muted-foreground">{e.model || ""}</div>
                </TableCell>
                <TableCell className="max-w-80 text-xs whitespace-normal text-muted-foreground">{attributeSummary(e, index) || "—"}</TableCell>
                <TableCell>
                  <VerificationBadge value={e.verification} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <EquipmentCompare open={comparing} onOpenChange={setComparing} items={selected} index={index} />
      <SaveSearchDialog open={saving} onOpenChange={setSaving} q={search.trim()} filters={filters} />
    </div>
  );
}
