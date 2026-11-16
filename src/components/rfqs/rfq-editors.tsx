"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { Rfq, RfqVendor, SearchHit, SearchResponse, VendorPage } from "@/lib/api/types";
import { humanize } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

/** Vendors that fit the RFQ, found from its title (no typing needed): those used on your projects first, then the
 *  rest of the knowledge base. Keyword search only (no AI cost). */
function useSuggestions(query: string) {
  const search = (usedByUs: boolean) =>
    api<SearchResponse>("/search", {
      method: "POST",
      body: { query, parser: "local", rerank: false, limit: usedByUs ? 10 : 15, filters: usedByUs ? { used_by_us: true } : {} },
    });
  return useQuery({
    queryKey: ["rfq-suggestions", query],
    queryFn: async () => {
      const [ours, all] = await Promise.all([search(true).catch(() => null), search(false)]);
      const seen = new Set<string>();
      const out: { hit: SearchHit; ours: boolean }[] = [];
      for (const [list, isOurs] of [
        [ours?.results ?? [], true],
        [all.results, false],
      ] as const) {
        for (const hit of list) {
          if (seen.has(hit.vendor.id)) continue;
          seen.add(hit.vendor.id);
          out.push({ hit, ours: isOurs });
        }
      }
      return out.slice(0, 15);
    },
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

/** Add vendors to an RFQ: suggestions from its title, or a search by name. */
export function AddVendors({
  rfq,
  existing,
  onSaved,
}: {
  rfq: Rfq;
  existing: Set<string>;
  onSaved: (rows: RfqVendor[]) => void;
}) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 300);
  const byName = useQuery({
    queryKey: ["vendors", "pick", term],
    queryFn: ({ signal }) => api<VendorPage>("/vendors", { query: { q: term, limit: 10 }, signal }),
    enabled: term.length >= 2,
  });
  const suggested = useSuggestions(rfq.title);
  const add = useMutation({
    mutationFn: async (vendorIds: string[]) => {
      let rows: RfqVendor[] = [];
      for (const vendorId of vendorIds) rows = await api<RfqVendor[]>(`/rfqs/${rfq.id}/vendors`, { method: "POST", body: { vendor_id: vendorId } });
      return rows;
    },
    onSuccess: (rows, ids) => {
      onSaved(rows);
      setQ("");
      toast.success(`${ids.length} vendor${ids.length === 1 ? "" : "s"} added`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const searching = term.length >= 2;
  const suggestions = (suggested.data ?? []).filter((s) => !existing.has(s.hit.vendor.id));

  const row = (id: string, name: string, detail: React.ReactNode, email?: string | null) => (
    <div key={id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
      <div className="min-w-0 flex-1">
        <Link href={`/vendors/${id}`} target="_blank" className="font-medium hover:underline">
          {name}
        </Link>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{detail}</div>
        {email && (
          <a href={`mailto:${email}`} className="text-xs text-primary break-all hover:underline">
            {email}
          </a>
        )}
      </div>
      {existing.has(id) ? (
        <span className="text-xs text-muted-foreground">On the RFQ</span>
      ) : (
        <Button size="xs" variant="outline" disabled={add.isPending} onClick={() => add.mutate([id])}>
          <Plus /> Add
        </Button>
      )}
    </div>
  );

  return (
    <div className="grid gap-2">
      <Input aria-label="Find a vendor to invite" placeholder="Search any vendor by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {searching ? (
        <div className="grid gap-0.5 rounded-md border p-1">
          {byName.isPending && <Skeleton className="h-8" />}
          {byName.data?.items.length === 0 && <p className="p-2 text-sm text-muted-foreground">No vendor named like &ldquo;{term}&rdquo;.</p>}
          {byName.data?.items.map((v) =>
            row(
              v.id,
              v.display_name,
              [v.hq_country && countryName(v.hq_country), v.tenant?.avl_status && humanize(v.tenant.avl_status)].filter(Boolean).join(" · "),
              v.email,
            ),
          )}
        </div>
      ) : (
        <div className="grid gap-1 rounded-md border p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" /> Suggested for &ldquo;{rfq.title}&rdquo;
            </span>
            {suggestions.length > 1 && (
              <Button size="xs" variant="ghost" disabled={add.isPending} onClick={() => add.mutate(suggestions.slice(0, 5).map((s) => s.hit.vendor.id))}>
                Add top {Math.min(5, suggestions.length)}
              </Button>
            )}
          </div>
          {suggested.isPending && <Skeleton className="h-24" />}
          {suggested.isError && <p className="p-2 text-sm text-destructive">{errorMessage(suggested.error)}</p>}
          {suggested.data && suggestions.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No more suggestions from the title. Search a vendor by name above, or browse the{" "}
              <Link href="/vendors" className="underline">
                vendor database
              </Link>
              .
            </p>
          )}
          {suggestions.map(({ hit, ours }) =>
            row(
              hit.vendor.id,
              hit.vendor.display_name,
              <>
                {ours && <Badge variant="secondary">Used on your projects</Badge>}
                {hit.vendor.tenant?.avl_status === "approved" && <Badge variant="secondary">Approved</Badge>}
                <span>{[hit.vendor.hq_country && countryName(hit.vendor.hq_country), hit.reasons[0]?.label].filter(Boolean).join(" · ")}</span>
              </>,
              hit.vendor.email,
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Requirements of a draft RFQ: add with a mandatory / optional flag, or remove. */
export function RequirementsEditor({ rfq, onSaved }: { rfq: Rfq; onSaved: (r: Rfq) => void }) {
  const [text, setText] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const save = useMutation({
    mutationFn: (requirements: { text: string; mandatory: boolean }[]) =>
      api<Rfq>(`/rfqs/${rfq.id}`, { method: "PATCH", body: { version: rfq.version, requirements } }),
    onSuccess: (r) => {
      onSaved(r);
      setText("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const current = rfq.requirements.map((r) => ({ text: r.text, mandatory: r.mandatory !== false }));
  return (
    <div className="grid gap-2">
      {current.length > 0 && (
        <ul className="grid gap-1">
          {current.map((req, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="flex-1">
                {req.text}
                {!req.mandatory && <span className="text-xs text-muted-foreground"> (optional)</span>}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${req.text}`}
                disabled={save.isPending}
                onClick={() => save.mutate(current.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) save.mutate([...current, { text: text.trim(), mandatory }]);
        }}
      >
        <Input aria-label="New requirement" placeholder="e.g. API 610 type BB2, ABS class approval" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-2 text-xs font-normal">
            <Checkbox checked={mandatory} onCheckedChange={(c) => setMandatory(Boolean(c))} /> Mandatory
          </Label>
          <Button size="sm" type="submit" disabled={!text.trim() || save.isPending}>
            <Plus /> Add requirement
          </Button>
        </div>
      </form>
    </div>
  );
}
