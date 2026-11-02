"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ExternalLink, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TERMINAL_JOB_STATUSES, useLiveJob } from "@/hooks/use-live-job";
import { ApiError, api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { JobRead, ProposalDetail } from "@/lib/api/types";
import { formatDateTime, humanize, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

// AI fill for vendors: look up a missing website / headquarters / description with web search, or research vendor
// websites for facts, then approve the results in place. Used by the data-quality page and the vendor list.

type LookupAccepted = components["schemas"]["LookupAccepted"];
type ResearchAccepted = components["schemas"]["ResearchAccepted"];
type ResearchQueued = components["schemas"]["ResearchQueued"];
type LookupField = "website" | "hq_country" | "description" | "contacts";

interface LookupRow {
  vendor_id: string;
  name: string;
  status: "proposed" | "not_found" | "rejected" | "already_filled" | "failed";
  value: string | null;
  city: string | null;
  source_url: string | null;
  confidence: number | null;
  checked: "home_page" | "citation" | null;
  reason: string;
  proposal_id: string | null;
  other_vendor_id: string | null;
  other_vendor_name: string | null;
  found?: string[];
}

type Decision = "approved" | "rejected";

const pct = (score: number) => `${Math.round(score * 100)}%`;
/** The API's cap per run. */
export const MAX_AI_SELECTED = 25;
const LOOKUP_USD = 0.014; // one AI web search per vendor
const RESEARCH_USD = 0.05; // reading the vendor's website with AI

export type AiAction = "website" | "hq_country" | "description" | "contacts" | "research";

const ACTIONS: Record<AiAction, { label: string; noun: string }> = {
  website: { label: "Find websites", noun: "websites" },
  hq_country: { label: "Find headquarters", noun: "headquarters countries" },
  description: { label: "Write descriptions", noun: "descriptions" },
  contacts: { label: "Find contact details", noun: "contact details" },
  research: { label: "Research websites", noun: "website research" },
};

const FOUND_LABEL: Record<LookupField, string> = {
  website: "Website found",
  hq_country: "Headquarters found",
  description: "Description",
  contacts: "Found on their site",
};
const TITLE: Record<LookupField, string> = { website: "Website", hq_country: "Headquarters", description: "Description", contacts: "Contact details" };

const OUTCOME: Record<LookupRow["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  proposed: { label: "Passed the checks", variant: "default" },
  not_found: { label: "Not found", variant: "secondary" },
  rejected: { label: "Not accepted", variant: "outline" },
  already_filled: { label: "Already filled", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

/** Approves or rejects a proposal at its current version (what the Approvals screen does). */
async function decide(proposalId: string, decision: "approve" | "reject"): Promise<ProposalDetail> {
  const p = await api<ProposalDetail>(`/admin/proposals/${proposalId}`);
  return api<ProposalDetail>(`/admin/proposals/${proposalId}/${decision}`, {
    method: "POST",
    body: { version: p.version, note: "Decided from the data-quality page" },
  });
}

/** A curator overrides the AI's checks: propose the answer by hand and approve it straight away. `shared` saves a
 *  group company's website without taking its domain from the vendor that owns it. */
async function approveAnyway(r: LookupRow, field: LookupField, shared = false): Promise<ProposalDetail> {
  const evidence = [{ kind: "web", url: r.source_url ?? r.value, title: "AI lookup, confirmed by a curator", snippet: r.reason }];
  type Payload = { field: string; value: string | null; shared_domain?: boolean };
  const items: { action: string; payload: Payload; evidence: typeof evidence; confidence: number | null }[] = [
    { action: "update_vendor_field", payload: { field, value: r.value, ...(shared && { shared_domain: true }) }, evidence, confidence: r.confidence },
  ];
  if (field === "hq_country" && r.city) items.push({ ...items[0], payload: { field: "hq_city", value: r.city } });
  const p = await api<ProposalDetail>("/admin/proposals", {
    method: "POST",
    body: { kind: "update_vendor", subject_vendor_id: r.vendor_id, title: `${TITLE[field]} for ${r.name}`, items },
  });
  return decide(p.id, "approve");
}

/** The vendor that already owns a website's domain, from a `duplicate_vendor` approval error. */
interface DomainOwner {
  id: string;
  name: string;
  domain: string;
}

/** Runs one approve/reject at a time per row and remembers the outcome (or the domain clash that blocked it). */
function useDecisions() {
  const queryClient = useQueryClient();
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [conflicts, setConflicts] = useState<Record<string, DomainOwner>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const run = async (key: string, label: string, action: () => Promise<unknown>, outcome: Decision) => {
    setBusy((b) => new Set(b).add(key));
    try {
      await action();
      setDecided((d) => ({ ...d, [key]: outcome }));
      setConflicts((c) => {
        const next = { ...c };
        delete next[key];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["data-quality"] });
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor"] });
    } catch (e) {
      const owner = e instanceof ApiError && e.code === "duplicate_vendor" ? (e.errors[0] as unknown as Record<string, string>) : null;
      if (owner?.other_vendor_id) {
        setConflicts((c) => ({ ...c, [key]: { id: owner.other_vendor_id, name: owner.other_vendor_name, domain: owner.domain } }));
      } else {
        toast.error(`${label}: ${errorMessage(e)}`);
      }
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  };
  return { decided, conflicts, busy, run };
}

type Run = ReturnType<typeof useDecisions>["run"];

function DecisionButtons({ id, label, rowKey, busy, run }: { id: string; label: string; rowKey: string; busy: boolean; run: Run }) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" disabled={busy} onClick={() => void run(rowKey, label, () => decide(id, "approve"), "approved")}>
        <Check /> Approve
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(rowKey, label, () => decide(id, "reject"), "rejected")}>
        Reject
      </Button>
    </div>
  );
}

function Decided({ outcome }: { outcome: Decision }) {
  return <Badge variant={outcome === "approved" ? "default" : "secondary"}>{outcome === "approved" ? "Approved" : "Rejected"}</Badge>;
}

function Found({ r, field }: { r: LookupRow; field: LookupField }) {
  if (!r.value) return <span className="text-muted-foreground">—</span>;
  const source = r.source_url && (
    <a href={r.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
      Source <ExternalLink className="size-3" />
    </a>
  );
  if (field === "website")
    return (
      <>
        <a href={r.value} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 truncate text-sm hover:underline">
          {r.value.replace(/^https?:\/\//, "")} <ExternalLink className="size-3 shrink-0" />
        </a>
        {r.checked && (
          <div className="text-xs text-muted-foreground">{r.checked === "home_page" ? "Home page names the company" : "Backed by search results"}</div>
        )}
      </>
    );
  if (field === "contacts")
    return (
      <>
        <ul className="grid gap-0.5 text-sm whitespace-normal">
          {(r.found ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {source}
      </>
    );
  if (field === "hq_country")
    return (
      <>
        <div className="text-sm">{[r.city, countryName(r.value)].filter(Boolean).join(", ")}</div>
        {source}
      </>
    );
  return (
    <>
      <p className="max-w-md text-sm whitespace-normal">{r.value}</p>
      {source}
    </>
  );
}

/** The website's domain belongs to another vendor: compare it, save as a group company's site, or reject. */
function SharedDomainActions({
  r,
  owner,
  blocked,
  busy,
  onShare,
  onReject,
}: {
  r: LookupRow;
  owner: DomainOwner;
  blocked: boolean;
  busy: boolean;
  onShare: () => void;
  onReject: () => void;
}) {
  return (
    <div className="grid justify-items-end gap-1">
      {blocked && (
        <p className="max-w-56 text-right text-xs text-muted-foreground whitespace-normal">
          {owner.domain || "This website"} already belongs to {owner.name}.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="ghost" render={<Link href={`/vendors/${owner.id}`} />}>
          Open {owner.name}
        </Button>
        {r.value && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onShare}>
            Save as group website
          </Button>
        )}
        {blocked && r.proposal_id && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}

/** Once a job finishes, reload the lists so each vendor shows it was checked. */
function useRefreshWhenDone(done: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (done) void queryClient.invalidateQueries({ queryKey: ["data-quality"] });
  }, [done, queryClient]);
}

/** How a vendor's last AI checks went, for lists of vendors. */
const CHECK_LABEL: Record<string, string> = {
  website: "Website",
  hq_country: "Headquarters",
  description: "Description",
  contacts: "Contacts",
  research: "Research",
};
const CHECK_STATUS: Record<string, string> = {
  proposed: "found",
  not_found: "not found",
  rejected: "not accepted",
  already_filled: "already filled",
  failed: "failed",
};

export function AiChecks({ checks }: { checks: { field: string; status: string; at: string }[] }) {
  if (!checks.length) return <span className="text-xs text-muted-foreground">Not checked</span>;
  return (
    <div className="grid gap-0.5">
      {checks.map((c) => (
        <div key={c.field} className="text-xs whitespace-nowrap" title={formatDateTime(c.at)}>
          <span className={c.status === "proposed" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
            {CHECK_LABEL[c.field] ?? humanize(c.field)}: {CHECK_STATUS[c.status] ?? humanize(c.status).toLowerCase()}
          </span>{" "}
          <span className="text-muted-foreground">· {timeAgo(c.at)}</span>
        </div>
      ))}
    </div>
  );
}

/** Live progress, then what the AI found for each vendor, with approve / reject in place. */
export function LookupResults({ jobId, field, onClose }: { jobId: string; field: LookupField; onClose: () => void }) {
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api<JobRead>(`/jobs/${jobId}`) });
  const done = Boolean(job.data && TERMINAL_JOB_STATUSES.has(job.data.status));
  useLiveJob(jobId, !done);
  useRefreshWhenDone(done);
  const result = job.data?.result as { counts: Record<string, number>; rows: LookupRow[] } | null | undefined;
  const { decided, conflicts, busy, run } = useDecisions();
  const open = (result?.rows ?? []).filter(
    (r) => r.status === "proposed" && r.proposal_id && !decided[r.vendor_id] && !conflicts[r.vendor_id],
  );
  // Group company on its parent's site: drop the pending proposal (if any), then save the website without the domain.
  const saveAsGroupSite = (r: LookupRow) =>
    run(r.vendor_id, r.name, async () => {
      if (r.proposal_id) await decide(r.proposal_id, "reject");
      await approveAnyway(r, "website", true);
    }, "approved");
  const approveAll = async () => {
    for (const r of open) await run(r.vendor_id, r.name, () => decide(r.proposal_id!, "approve"), "approved");
    toast.success("Approved");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle>AI search: {TITLE[field].toLowerCase()}</CardTitle>
          <CardDescription>
            {!done
              ? "Searching the web for each vendor…"
              : job.data?.status === "failed"
                ? errorMessage(job.data.error?.detail ?? "The search failed")
                : `${result?.counts.proposed ?? 0} answer(s) passed the checks. Approve them here or in Approvals; nothing changes until a curator approves.`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {open.length > 1 && (
            <Button size="sm" disabled={busy.size > 0} onClick={() => void approveAll()}>
              <Check /> Approve all ({open.length})
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Close results" onClick={onClose}>
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!done && (
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={job.data?.progress ?? 0}>
            <div className="h-full bg-primary transition-all" style={{ width: `${job.data?.progress ?? 2}%` }} />
          </div>
        )}
        {done && result && (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>{FOUND_LABEL[field]}</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="w-48 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.vendor_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="whitespace-normal">
                      <Badge variant={OUTCOME[r.status].variant}>{OUTCOME[r.status].label}</Badge>
                      {r.reason && <div className="mt-1 max-w-sm text-xs text-muted-foreground">{r.reason}</div>}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <Found r={r} field={field} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.confidence === null ? "—" : pct(r.confidence)}</TableCell>
                    <TableCell className="text-right">
                      {decided[r.vendor_id] ? (
                        <Decided outcome={decided[r.vendor_id]} />
                      ) : conflicts[r.vendor_id] || r.other_vendor_id ? (
                        <SharedDomainActions
                          r={r}
                          owner={conflicts[r.vendor_id] ?? { id: r.other_vendor_id!, name: r.other_vendor_name ?? "another vendor", domain: "" }}
                          blocked={Boolean(conflicts[r.vendor_id])}
                          busy={busy.has(r.vendor_id)}
                          onShare={() => void saveAsGroupSite(r)}
                          onReject={() => void run(r.vendor_id, r.name, () => decide(r.proposal_id!, "reject"), "rejected")}
                        />
                      ) : r.status === "proposed" && r.proposal_id ? (
                        <DecisionButtons id={r.proposal_id} label={r.name} rowKey={r.vendor_id} busy={busy.has(r.vendor_id)} run={run} />
                      ) : r.status === "rejected" && r.value ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy.has(r.vendor_id)}
                          onClick={() => void run(r.vendor_id, r.name, () => approveAnyway(r, field), "approved")}
                        >
                          Use this anyway
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One researched vendor: its job's live status, then approve / reject the facts it proposed. */
function ResearchRow({ v, decided, busy, run }: { v: ResearchQueued; decided?: Decision; busy: boolean; run: Run }) {
  const job = useQuery({
    queryKey: ["job", v.job_id],
    queryFn: () => api<JobRead>(`/jobs/${v.job_id}`),
    enabled: Boolean(v.job_id),
    refetchInterval: (q) => (q.state.data && TERMINAL_JOB_STATUSES.has(q.state.data.status) ? false : 5000),
  });
  const result = job.data?.result as { proposal_id?: string | null; facts_verified?: number; outcome?: string } | null | undefined;
  const done = Boolean(job.data && TERMINAL_JOB_STATUSES.has(job.data.status));
  useRefreshWhenDone(done);
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={`/vendors/${v.vendor_id}`} className="hover:underline">
          {v.name}
        </Link>
      </TableCell>
      <TableCell className="whitespace-normal">
        {v.skipped ? (
          <span className="text-sm text-muted-foreground">Skipped: {v.skipped}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {job.data && <StatusBadge status={job.data.status} />}
            {!done && job.data && <span className="text-xs text-muted-foreground tabular-nums">{job.data.progress}%</span>}
            {done && job.data?.status === "succeeded" && (
              <span className="text-xs text-muted-foreground">
                {result?.proposal_id ? `${result.facts_verified ?? 0} verified fact(s) proposed` : "Nothing new found"}
              </span>
            )}
            {done && job.data?.status === "failed" && (
              <span className="text-xs text-destructive">{errorMessage(job.data.error?.detail ?? "Failed")}</span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">
        {decided ? (
          <Decided outcome={decided} />
        ) : result?.proposal_id ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" render={<Link href={`/admin/proposals/${result.proposal_id}`} />}>
              Review
            </Button>
            <DecisionButtons id={result.proposal_id} label={v.name} rowKey={v.vendor_id} busy={busy} run={run} />
          </div>
        ) : v.job_id ? (
          <Button size="sm" variant="ghost" render={<Link href={`/jobs/${v.job_id}`} />}>
            Job
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function ResearchResults({
  research,
  onClose,
  onFindWebsites,
}: {
  research: ResearchAccepted;
  onClose: () => void;
  onFindWebsites: (vendorIds: string[]) => void;
}) {
  const { decided, busy, run } = useDecisions();
  // Research needs a website to read; offer to find the missing ones instead of leaving a list of skips.
  const noSite = research.vendors.filter((v) => v.skipped?.startsWith("No website")).map((v) => v.vendor_id);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle>AI website research</CardTitle>
          <CardDescription>
            {research.queued
              ? `Reading ${research.queued} vendor website(s) for equipment, services, certifications and their sources. Each vendor's new facts come as one proposal: review the details, or approve them here.`
              : "Nothing to research: none of these vendors has a website on record yet."}
            {noSite.length > 0 && ` ${noSite.length} vendor(s) were skipped because they have no website; find their websites first, then research them.`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {noSite.length > 0 && (
            <Button size="sm" onClick={() => onFindWebsites(noSite)}>
              <Sparkles /> Find their websites with AI (about US${Math.max(0.01, Math.min(noSite.length, MAX_AI_SELECTED) * LOOKUP_USD).toFixed(2)})
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Close results" onClick={onClose}>
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-72 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {research.vendors.map((v) => (
                <ResearchRow key={v.vendor_id} v={v} decided={decided[v.vendor_id]} busy={busy.has(v.vendor_id)} run={run} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

type Results = { kind: "lookup"; jobId: string; field: LookupField } | { kind: "research"; research: ResearchAccepted };

/** Toolbar for the selected vendors: pick what the AI should fill, confirm the cost, then see and approve the results.
 *  `actions` lists what to offer; the first is the main button, the rest are in its menu. */
export function AiFillBar({
  selected,
  actions,
  onStarted,
  hint,
}: {
  selected: string[];
  actions: AiAction[];
  onStarted: () => void;
  hint: string;
}) {
  const [pending, setPending] = useState<AiAction | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const start = useMutation({
    mutationFn: async ({ action, ids }: { action: AiAction; ids?: string[] }): Promise<Results> => {
      const vendor_ids = ids ?? selected;
      if (action !== "research") {
        const r = await api<LookupAccepted>("/admin/data-quality/lookup", { method: "POST", body: { vendor_ids, field: action } });
        return { kind: "lookup", jobId: r.job_id, field: action };
      }
      const research = await api<ResearchAccepted>("/admin/data-quality/research", { method: "POST", body: { vendor_ids } });
      return { kind: "research", research };
    },
    onSuccess: (r) => {
      setPending(null);
      onStarted();
      setResults(r);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const n = selected.length;
  const [main, ...more] = actions;
  const cost = Math.max(0.01, n * (pending === "research" ? RESEARCH_USD : LOOKUP_USD)).toFixed(2);
  const copy =
    pending === "research"
      ? {
          title: `Research ${n} vendor website${n === 1 ? "" : "s"}?`,
          description: `The AI reads each vendor's website for equipment, services, certifications and their sources (about US$${cost} in total, from the platform AI budget). Vendors without a website are skipped. New facts wait for your approval.`,
        }
      : {
          title: `Find ${pending ? ACTIONS[pending].noun : ""} for ${n} vendor${n === 1 ? "" : "s"}?`,
          description:
            pending === "contacts"
              ? `The AI reads each vendor's own website (home, contact and about pages) for company emails, phone numbers and office addresses, about US$${cost} in total. Only values that appear on those pages are kept, and never a named person's email or mobile. Vendors without a website are skipped. Results wait for your approval.`
              : `The AI searches the web for each vendor (about US$${cost} in total, from the platform AI budget). Only answers that pass the checks are proposed, and they wait for your approval.`,
        };

  return (
    <>
      {results?.kind === "lookup" && (
        <LookupResults key={results.jobId} jobId={results.jobId} field={results.field} onClose={() => setResults(null)} />
      )}
      {results?.kind === "research" && (
        <ResearchResults
          research={results.research}
          onClose={() => setResults(null)}
          onFindWebsites={(ids) => start.mutate({ action: "website", ids: ids.slice(0, MAX_AI_SELECTED) })}
        />
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2">
        <span className="text-sm text-muted-foreground">{n ? `${n} selected` : hint}</span>
        <div className="ml-auto flex">
          <Button size="sm" className={more.length ? "rounded-r-none" : undefined} disabled={!n || start.isPending} onClick={() => setPending(main)}>
            <Sparkles /> {ACTIONS[main].label} with AI
          </Button>
          {more.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="More AI actions" disabled={!n || start.isPending} />}
              >
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-60">
                {more.map((a) => (
                  <DropdownMenuItem key={a} className="whitespace-nowrap" onClick={() => setPending(a)}>
                    {ACTIONS[a].label} with AI
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={copy.title}
        description={copy.description}
        confirmLabel={pending === "research" ? "Research" : "Search the web"}
        pending={start.isPending}
        onConfirm={() => pending && start.mutate({ action: pending })}
      />
    </>
  );
}
