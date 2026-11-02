"use client";

import { CheckCircle2, ExternalLink, Globe, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChatResponse, VendorDetail } from "@/lib/api/types";

import { Chip, DEFAULT_WEIGHTS, Panel, type Ranked, rank, useVendorDetails, type Weights } from "./workspace-shared";
import { ShortlistTab } from "./workspace-shortlist";
import { CompareTab, ScorecardTab } from "./workspace-vendors";

/** One question and its answer, as the workspace and the activity log see it. */
export interface Exchange {
  question: string;
  reply: ChatResponse;
  askedAt: string; // ISO time the question was asked
}

const WEIGHTS_KEY = "assistant-weights";

function loadWeights(): Weights {
  try {
    const saved = JSON.parse(localStorage.getItem(WEIGHTS_KEY) ?? "null") as Partial<Weights> | null;
    return saved ? { ...DEFAULT_WEIGHTS, ...saved } : DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function SourcesTab({ exchanges, ranked, details }: { exchanges: Exchange[]; ranked: Ranked[]; details: Record<string, VendorDetail> }) {
  const vendors = ranked.map((r) => details[r.vendor_id]).filter((v): v is VendorDetail => Boolean(v));
  const byKind = new Map<string, { pages: number; vendors: Set<string> }>();
  for (const v of vendors)
    for (const s of v.sources) {
      const k = byKind.get(s.kind) ?? { pages: 0, vendors: new Set<string>() };
      k.pages += 1;
      k.vendors.add(v.id);
      byKind.set(s.kind, k);
    }
  const web = [...new Map(exchanges.flatMap((e) => e.reply.web_sources ?? []).map((w) => [w.url, w])).values()];
  const facts = vendors.reduce((n, v) => n + v.equipment.length + v.certifications.length + v.projects.length + v.services.length, 0);
  const gaps = ranked.reduce((n, r) => n + r.flags.length, 0);
  const total = facts + web.length + gaps || 1;
  const KIND: Record<string, string> = {
    web: "Vendor websites (crawled, then reviewed)",
    document: "Documents and datasheets",
    excel: "Imported spreadsheets",
    manual: "Entered by curators",
    ai: "AI research (reviewed before approval)",
  };

  return (
    <div className="grid gap-4">
      <Panel title="Where the shortlist's facts come from">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Source</th>
                <th className="p-2">Pages / files</th>
                <th className="p-2">Vendors covered</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...byKind.entries()].map(([kind, k]) => (
                <tr key={kind} className="border-t">
                  <td className="p-2 font-medium">{KIND[kind] ?? kind}</td>
                  <td className="p-2 tabular-nums">{k.pages}</td>
                  <td className="p-2 tabular-nums">
                    {k.vendors.size} of {ranked.length}
                  </td>
                  <td className="p-2">
                    <Chip tone="ok">In knowledge base</Chip>
                  </td>
                </tr>
              ))}
              <tr className="border-t">
                <td className="p-2 font-medium">Web search during this chat</td>
                <td className="p-2 tabular-nums">{web.length}</td>
                <td className="p-2 text-muted-foreground">—</td>
                <td className="p-2">
                  <Chip tone="warn">Not verified</Chip>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Data confidence mix">
        {[
          { label: "Approved facts in the knowledge base", n: facts, cls: "bg-emerald-500" },
          { label: "Web pages found (not verified)", n: web.length, cls: "bg-sky-500" },
          { label: "Gaps flagged on the shortlist", n: gaps, cls: "bg-amber-500" },
        ].map((x) => (
          <div key={x.label} className="grid grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
            <span>{x.label}</span>
            <span className="block h-2 overflow-hidden rounded-full bg-muted">
              <span className={`block h-full rounded-full ${x.cls}`} style={{ width: `${Math.round((x.n / total) * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums">{x.n}</span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Scores use approved facts only. Web findings stay out of the ranking until they&apos;re researched and approved.</p>
      </Panel>

      <Panel title={`Web pages cited in this chat (${web.length})`}>
        {web.length ? (
          <ul className="grid gap-1.5 text-sm">
            {web.map((w) => (
              <li key={w.url} className="flex min-w-0 items-center gap-2">
                <Globe className="size-3.5 shrink-0 text-sky-600" />
                <a href={w.url} target="_blank" rel="noreferrer noopener" className="truncate hover:underline" title={w.url}>
                  {w.title}
                </a>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                  {hostname(w.url)} <ExternalLink className="size-3" />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No web pages cited yet.</p>
        )}
      </Panel>
    </div>
  );
}

function ActivityTab({ exchanges }: { exchanges: Exchange[] }) {
  const time = (iso: string, plusMs = 0) => new Date(new Date(iso).getTime() + plusMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return (
    <Panel title="Activity">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-28 p-2">Time</th>
              <th className="p-2">Event</th>
            </tr>
          </thead>
          <tbody>
            {exchanges.flatMap((e, i) => {
              const start = e.reply.started_at ?? e.askedAt;
              let elapsed = 0;
              return [
                <tr key={`${i}-q`} className="border-t bg-muted/20">
                  <td className="p-2 tabular-nums">{time(start)}</td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <MessageSquare className="size-3.5" /> You asked
                    </span>{" "}
                    <span className="text-muted-foreground">“{e.question}”</span>
                  </td>
                </tr>,
                ...(e.reply.steps ?? []).map((s, j) => {
                  elapsed += s.ms;
                  return (
                    <tr key={`${i}-${j}`} className="border-t">
                      <td className="p-2 text-muted-foreground tabular-nums">{time(start, elapsed)}</td>
                      <td className="p-2">
                        <span className="font-medium">{s.label}</span> <span className="text-muted-foreground">· {s.detail}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({(s.ms / 1000).toFixed(1)} s)</span>
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Every step of this chat, saved with it. AI calls are also metered on the AI usage page.</p>
    </Panel>
  );
}

/** The panel beside the chat: shortlist with live weights, a vendor's scorecard, side-by-side comparison, where the
 *  facts come from, and what the assistant did. Shows the answer picked in the chat (the latest by default). */
export function Workspace({ exchange, exchanges }: { exchange: Exchange; exchanges: Exchange[] }) {
  const [tab, setTab] = useState("shortlist");
  const [weights, setWeightsState] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selected, setSelected] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const goTo = (next: string) => {
    setTab(next);
    scroller.current?.scrollTo({ top: 0 }); // each tab opens at its top
  };
  useEffect(() => {
    // Saved weights are a per-browser convenience, read after mount so the first render matches the server.
    const saved = loadWeights();
    if (JSON.stringify(saved) !== JSON.stringify(DEFAULT_WEIGHTS)) queueMicrotask(() => setWeightsState(saved));
  }, []);
  const setWeights = (w: Weights) => {
    setWeightsState(w);
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w));
    } catch {
      // storage unavailable (private window): weights just aren't remembered
    }
  };

  const shortlist = useMemo(() => exchange.reply.shortlist ?? [], [exchange]);
  const ranked = useMemo(() => rank(shortlist, weights), [shortlist, weights]);
  const { byId, loading } = useVendorDetails(shortlist.map((r) => r.vendor_id));
  const openVendor = (id: string) => {
    setSelected(id);
    goTo("scorecard");
  };

  return (
    <Tabs value={tab} onValueChange={(v) => goTo(String(v))} className="flex h-full min-h-0 flex-col gap-0">
      <div className="shrink-0 overflow-x-auto border-b px-4">
        <TabsList variant="line" className="h-12">
          <TabsTrigger value="shortlist">Shortlist</TabsTrigger>
          <TabsTrigger value="scorecard">Vendor scorecard</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </div>
      <div ref={scroller} className="@container min-h-0 flex-1 overflow-y-auto p-4">
        {!shortlist.length && tab !== "activity" && tab !== "sources" ? (
          <div className="grid justify-items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="size-6" />
            This answer didn&apos;t involve vendors from the knowledge base. Ask about equipment or suppliers to build a shortlist.
          </div>
        ) : (
          <>
            <TabsContent value="shortlist">
              <ShortlistTab reply={exchange.reply} question={exchange.question} ranked={ranked} weights={weights} onWeights={setWeights} onOpenVendor={openVendor} />
            </TabsContent>
            <TabsContent value="scorecard">
              <ScorecardTab ranked={ranked} selected={selected} onSelect={setSelected} details={byId} loading={loading} requirement={exchange.reply.requirement} />
            </TabsContent>
            <TabsContent value="compare">
              <CompareTab ranked={ranked} details={byId} loading={loading} onOpenVendor={openVendor} />
            </TabsContent>
          </>
        )}
        <TabsContent value="sources">
          <SourcesTab exchanges={exchanges} ranked={ranked} details={byId} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab exchanges={exchanges} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
