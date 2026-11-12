"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, ExternalLink, Factory, History, Search, Sparkles, Trash2, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { SavedVendorSearches } from "@/components/search/saved-vendor-searches";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCertificationTypes, useEquipmentCategories, useIndustries, useServiceCategories } from "@/hooks/use-taxonomy";
import { api } from "@/lib/api/client";
import type { MatchReason, SearchHistoryEntry, SearchHit, SearchIntent, SearchRequest, SearchResponse } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { AVL_OPTIONS, countryName } from "@/lib/vendors";
import type { AvlStatus } from "@/lib/api/types";

type ListField = "equipment_categories" | "service_categories" | "industries" | "certifications" | "standards" | "countries";

const CHIP_FIELDS: { field: ListField; label: string }[] = [
  { field: "equipment_categories", label: "Equipment" },
  { field: "service_categories", label: "Service" },
  { field: "industries", label: "Industry" },
  { field: "certifications", label: "Certification" },
  { field: "standards", label: "Standard" },
  { field: "countries", label: "Country" },
];

const REASON_ICONS: Record<MatchReason["kind"], React.ComponentType<{ className?: string }>> = {
  equipment: Factory,
  service: Wrench,
  certification: Award,
  standard: Award,
  industry: Factory,
  text: Search,
  semantic: Sparkles,
  ai: Sparkles,
};

const SCORE_LABELS: Record<string, string> = {
  equipment: "Equipment",
  standards_certifications: "Standards & certifications",
  industries: "Industries",
  services: "Services",
  semantic: "Meaning",
  text: "Words",
  data_quality: "Data quality",
};

/** Taxonomy code -> display name, for the chips. */
function useNames() {
  const eq = useEquipmentCategories();
  const sv = useServiceCategories();
  const ind = useIndustries();
  const ct = useCertificationTypes();
  return (field: ListField, value: string): string => {
    if (field === "countries") return countryName(value);
    const list = { equipment_categories: eq.data, service_categories: sv.data, industries: ind.data, certifications: ct.data }[
      field as Exclude<ListField, "standards" | "countries">
    ];
    return list?.find((r) => r.code === value)?.name ?? value;
  };
}

function IntentChips({ intent, onChange }: { intent: SearchIntent; onChange: (next: SearchIntent) => void }) {
  const name = useNames();
  const chips = CHIP_FIELDS.flatMap(({ field, label }) => (intent[field] ?? []).map((value) => ({ field, label, value })));
  if (!chips.length && !intent.keywords) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="What the search looked for">
      <span className="text-xs text-muted-foreground">Looking for:</span>
      {chips.map(({ field, label, value }) => (
        <Badge key={`${field}:${value}`} variant="secondary" className="gap-1 pr-1">
          <span className="text-muted-foreground">{label}:</span> {name(field, value)}
          <button
            type="button"
            aria-label={`Remove ${name(field, value)}`}
            className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
            onClick={() => onChange({ ...intent, [field]: (intent[field] ?? []).filter((v) => v !== value) })}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {intent.keywords && (
        <Badge variant="outline" className="gap-1 pr-1">
          <span className="text-muted-foreground">Words:</span> {intent.keywords}
          <button type="button" aria-label="Remove words" className="rounded-sm p-0.5 hover:bg-muted-foreground/20" onClick={() => onChange({ ...intent, keywords: "" })}>
            <X className="size-3" />
          </button>
        </Badge>
      )}
    </div>
  );
}

function Reason({ reason }: { reason: MatchReason }) {
  const Icon = REASON_ICONS[reason.kind];
  const source = reason.sources?.[0];
  return (
    <li className="flex gap-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className={reason.kind === "semantic" ? "text-muted-foreground italic" : ""}>{reason.label}</span>
        {source && (
          <div className="text-xs text-muted-foreground">
            {source.snippet && <>“{source.snippet}” </>}
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                source <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Hit({ hit }: { hit: SearchHit }) {
  const v = hit.vendor;
  const pct = Math.round(hit.confidence * 100);
  const scores = Object.entries(hit.scores).filter(([, s]) => s !== null && s !== undefined) as [string, number][];
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <Link href={`/vendors/${v.id}`} className="font-medium hover:underline">
              {v.display_name}
            </Link>
            <span className="text-xs text-muted-foreground">
              {[v.hq_city, v.hq_country && countryName(v.hq_country)].filter(Boolean).join(", ") || "Location unknown"} ·{" "}
              {v.equipment_count} equipment · {v.service_count} services · {v.certification_count} certifications
            </span>
          </div>
          <div className="flex items-center gap-2">
            {v.tenant && <StatusBadge status={v.tenant.avl_status} />}
            {hit.ai_fit !== null && hit.ai_fit !== undefined && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary" title="Technical fit judged by AI (0-10)">
                <Sparkles className="size-3" /> {hit.ai_fit}/10
              </span>
            )}
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-default" />}>
                <div className="flex w-28 items-center gap-2" aria-label={`Match ${pct}%`}>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-9 text-right text-sm font-medium tabular-nums">{pct}%</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="grid gap-0.5 text-xs">
                  {scores.map(([k, s]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span>{SCORE_LABELS[k] ?? k}</span>
                      <span className="tabular-nums">{Math.round(s * 100)}%</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {hit.reasons.length > 0 && (
          <ul className="grid gap-1.5" aria-label="Why it matched">
            {hit.reasons.map((r, i) => (
              <Reason key={i} reason={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentSearches({ onPick }: { onPick: (entry: SearchHistoryEntry) => void }) {
  const queryClient = useQueryClient();
  const actAs = useAuth((s) => s.actAs);
  const history = useQuery({
    queryKey: ["search-history", actAs?.id],
    queryFn: () => api<SearchHistoryEntry[]>("/search/history", { query: { limit: 15 } }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/search/history/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["search-history"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" /> Recent searches
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm">
        {history.isPending && <Skeleton className="h-16" />}
        {history.data?.length === 0 && <p className="text-muted-foreground">Your searches will appear here.</p>}
        {history.data?.map((h) => (
          <div key={h.id} className="group flex items-center gap-2">
            <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onPick(h)}>
              {h.query}
            </button>
            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(h.created_at)}</span>
            <button
              type="button"
              aria-label={`Delete search ${h.query}`}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={() => remove.mutate(h.id)}
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** "Norway, KR" -> ["Norway", "KR"] (the server turns names into ISO codes and refuses unknown ones). */
const splitList = (text: string) =>
  text
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);

export default function SearchPage() {
  const canSearch = useCan(P.SEARCH_RUN);
  const hasTenant = useAuth((s) => Boolean(s.user?.tenant || s.actAs));
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [myVendors, setMyVendors] = useState(false);
  const [avl, setAvl] = useState("");
  // SOW 16 filters: a standard or certification on a product, an equipment category, vendors from our own projects.
  const [standard, setStandard] = useState("");
  const [category, setCategory] = useState(useSearchParams().get("category") ?? "");
  const [usedByUs, setUsedByUs] = useState(false);
  const [acceptedByUs, setAcceptedByUs] = useState(false);
  const [factoryIn, setFactoryIn] = useState("");
  const [supportIn, setSupportIn] = useState("");
  const canHistory = useCan(P.EQUIPMENT_READ);
  const categories = useEquipmentCategories();
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.code, label: `${"\u00a0\u00a0".repeat(c.level)}${c.name}` }));
  const [result, setResult] = useState<SearchResponse | null>(null);

  const run = useMutation({
    mutationFn: (body: SearchRequest) => api<SearchResponse>("/search", { method: "POST", body }),
    onSuccess: (r) => {
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: ["search-history"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const filters = {
    my_vendors_only: myVendors,
    avl_status: avl ? [avl as AvlStatus] : [],
    standards: standard.trim() ? [standard.trim()] : [],
    equipment_category: category || null,
    used_by_us: usedByUs,
    technically_accepted_by_us: acceptedByUs,
    factory_countries: splitList(factoryIn),
    support_countries: splitList(supportIn),
  };
  function submit(q = query) {
    if (!q.trim()) return;
    run.mutate({ query: q, parser: useAi ? "ai" : "local", filters, limit: 25 });
  }
  function refine(intent: SearchIntent) {
    run.mutate({ query, intent, parser: result?.parser ?? "local", filters, limit: 25 });
  }

  if (!canSearch) return <NoAccess what="search" />;

  return (
    <>
      <PageHeader
        title="Search"
        description="Describe what you need in plain words. Results are ranked by how well each vendor's approved facts match, with the evidence behind every match."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="grid min-w-0 content-start gap-4">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex gap-2">
              <Input
                aria-label="Search query"
                placeholder="e.g. API 610 BB2 pumps for FPSO in Norway"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={500}
                className="h-10"
              />
              <Button type="submit" className="h-10" disabled={!query.trim() || run.isPending}>
                <Search /> {run.isPending ? "Searching…" : "Search"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox aria-label="Understand the query with AI" checked={useAi} onCheckedChange={(c) => setUseAi(Boolean(c))} />
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3.5" /> Understand with AI
                </span>
              </Label>
              {hasTenant && (
                <>
                  <Label className="flex items-center gap-2 font-normal">
                    <Checkbox aria-label="Only my vendors" checked={myVendors} onCheckedChange={(c) => setMyVendors(Boolean(c))} />
                    Only my vendors
                  </Label>
                  <FilterSelect label="AVL status" anyLabel="Any AVL status" value={avl} onChange={setAvl} options={AVL_OPTIONS} className="w-44" />
                  {canHistory && (
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox aria-label="Only vendors used on our projects" checked={usedByUs} onCheckedChange={(c) => setUsedByUs(Boolean(c))} />
                      Used on our projects
                    </Label>
                  )}
                  {canHistory && (
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox
                        aria-label="Only vendors we technically accepted before"
                        checked={acceptedByUs}
                        onCheckedChange={(c) => setAcceptedByUs(Boolean(c))}
                      />
                      Technically accepted by us
                    </Label>
                  )}
                </>
              )}
              <FilterSelect label="Equipment category" anyLabel="Any category" value={category} onChange={setCategory} options={categoryOptions} className="w-56" />
              <Input
                aria-label="Standard or certification"
                placeholder="Standard / certification, e.g. API 610, ABS"
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                maxLength={80}
                className="h-8 w-64"
              />
              <Input
                aria-label="Factory in country"
                placeholder="Factory in (e.g. Norway, KR)"
                value={factoryIn}
                onChange={(e) => setFactoryIn(e.target.value)}
                maxLength={200}
                className="h-8 w-52"
              />
              <Input
                aria-label="Support in country"
                placeholder="Service support in (e.g. Malaysia)"
                value={supportIn}
                onChange={(e) => setSupportIn(e.target.value)}
                maxLength={200}
                className="h-8 w-60"
              />
            </div>
          </form>

          {result && <IntentChips intent={result.intent} onChange={refine} />}
          {result && (
            <p className="text-xs text-muted-foreground">
              {result.results.length} vendor{result.results.length === 1 ? "" : "s"} · {result.took_ms} ms
              {result.reranked && " · re-ranked by AI for technical fit"}
              {!result.semantic && " · meaning-based matching unavailable"}
            </p>
          )}

          {run.isPending && !result && <Skeleton className="h-40" />}
          {result?.results.length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No vendors match. Remove a filter above, or try{" "}
              <Link href="/discovery/new" className="text-primary hover:underline">
                discovering new vendors with AI
              </Link>
              .
            </div>
          )}
          <div className="grid gap-3">
            {result?.results.map((hit) => (
              <Hit key={hit.vendor.id} hit={hit} />
            ))}
          </div>
        </div>
        <div className="grid content-start gap-4">
          <SavedVendorSearches
            query={query}
            filters={{ ...filters, use_ai: useAi }}
            onRun={(saved) => {
              const f = saved.filters as Record<string, unknown>;
              setQuery(saved.query);
              setMyVendors(Boolean(f.my_vendors_only));
              setAvl(Array.isArray(f.avl_status) && f.avl_status.length ? String(f.avl_status[0]) : "");
              setStandard(Array.isArray(f.standards) && f.standards.length ? String(f.standards[0]) : "");
              setCategory(typeof f.equipment_category === "string" ? f.equipment_category : "");
              setUsedByUs(Boolean(f.used_by_us));
              setAcceptedByUs(Boolean(f.technically_accepted_by_us));
              setFactoryIn(Array.isArray(f.factory_countries) ? f.factory_countries.join(", ") : "");
              setSupportIn(Array.isArray(f.support_countries) ? f.support_countries.join(", ") : "");
              setUseAi(Boolean(f.use_ai));
              const { use_ai: ai, ...stored } = f;
              run.mutate({ query: saved.query, parser: ai ? "ai" : "local", filters: { ...filters, ...stored } as typeof filters, limit: 25 });
            }}
          />
          <RecentSearches
            onPick={(h) => {
              setQuery(h.query);
              run.mutate({ query: h.query, intent: h.intent, parser: "local", filters, limit: 25 });
            }}
          />
        </div>
      </div>
    </>
  );
}
