"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Square, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TERMINAL_JOB_STATUSES, useLiveJob } from "@/hooks/use-live-job";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { JobRead } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

type Plan = components["schemas"]["EnrichPlan"];
type Accepted = components["schemas"]["EnrichAccepted"];
type Field = "website" | "hq_country" | "description" | "contacts";

const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: "website", label: "Websites", hint: "vendors without a website" },
  { key: "hq_country", label: "Headquarters country", hint: "vendors without a country" },
  { key: "description", label: "Descriptions", hint: "vendors without a description" },
  { key: "contacts", label: "Contact details", hint: "vendors with a website but no contacts (read from their own site)" },
];
const LABEL: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));
const PLAN_KEY = ["vendor-enrichment"];
const usd = (n: number) => `US$${n.toFixed(2)}`;

interface RunResult {
  fields: Field[];
  planned: Record<string, number>;
  counts: Record<string, Record<string, number>>;
  checked: number;
  total: number;
  current_field: string | null;
  spent_usd: number;
  max_usd: number | null;
  parallel?: number;
  stopped: "limit" | "budget" | null;
}

/** Start dialog: what a run would look up, what it may cost, and the spending limit. */
function StartDialog({ open, onOpenChange, onStarted }: { open: boolean; onOpenChange: (o: boolean) => void; onStarted: (jobId: string) => void }) {
  const queryClient = useQueryClient();
  const [skipChecked, setSkipChecked] = useState(true);
  const [fields, setFields] = useState<Set<Field>>(new Set(["website", "hq_country", "description", "contacts"]));
  const [limit, setLimit] = useState("");
  const plan = useQuery({
    queryKey: [...PLAN_KEY, skipChecked],
    queryFn: () => api<Plan>("/admin/vendor-enrichment", { query: { skip_checked: skipChecked } }),
    enabled: open,
  });
  const p = plan.data;
  const chosen = FIELDS.filter((f) => fields.has(f.key));
  const lookups = chosen.reduce((n, f) => n + (p?.planned[f.key] ?? 0), 0);
  const perLookup = p && Object.values(p.planned).reduce((a, b) => a + b, 0) ? p.estimated_cost_usd / Object.values(p.planned).reduce((a, b) => a + b, 0) : 0;
  const estimate = lookups * perLookup;
  const suggested = p ? Math.max(0.5, Math.min(estimate, p.budget_remaining_usd)) : 0;
  const maxUsd = limit ? Number(limit) : Number(suggested.toFixed(2));
  const start = useMutation({
    mutationFn: () =>
      api<Accepted>("/admin/vendor-enrichment", {
        method: "POST",
        body: { fields: chosen.map((f) => f.key), skip_checked: skipChecked, max_usd: maxUsd },
      }),
    onSuccess: (r) => {
      toast.success("AI run started in the background. You can leave this page; progress shows here.");
      void queryClient.invalidateQueries({ queryKey: PLAN_KEY });
      onStarted(r.job_id);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Run AI on all vendors</DialogTitle>
          <DialogDescription>
            The AI looks up the missing details of every vendor in the knowledge base in one continuous background run: all the details together, several look-ups in
            parallel, each starting as soon as the last one finishes. Answers that pass the checks wait in Approvals; nothing changes without a curator.
          </DialogDescription>
        </DialogHeader>
        {plan.isPending && <Skeleton className="h-40" />}
        {plan.isError && <p className="text-sm text-destructive">{errorMessage(plan.error)}</p>}
        {p && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              {FIELDS.map((f) => (
                <Label key={f.key} className="flex items-start gap-2 font-normal">
                  <Checkbox
                    className="mt-0.5"
                    checked={fields.has(f.key)}
                    onCheckedChange={(c) =>
                      setFields((prev) => {
                        const next = new Set(prev);
                        if (c) next.add(f.key);
                        else next.delete(f.key);
                        return next;
                      })
                    }
                  />
                  <span>
                    <span className="font-medium">{f.label}</span> <span className="tabular-nums">({(p.planned[f.key] ?? 0).toLocaleString()})</span>
                    <span className="block text-xs text-muted-foreground">{f.hint}</span>
                  </span>
                </Label>
              ))}
            </div>
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={skipChecked} onCheckedChange={(c) => setSkipChecked(Boolean(c))} />
              Skip vendors the AI already checked for that detail
            </Label>
            <div className="grid gap-1.5 rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span>Look-ups</span>
                <span className="tabular-nums">{lookups.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated cost</span>
                <span className="tabular-nums">about {usd(estimate)}</span>
              </div>
              <div className="flex justify-between">
                <span>AI budget left this month</span>
                <span className="tabular-nums">
                  {usd(p.budget_remaining_usd)} of {usd(p.budget_limit_usd)}
                </span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="enrich-limit">Stop after spending (US$)</Label>
              <Input
                id="enrich-limit"
                type="number"
                min={0.5}
                step={0.5}
                placeholder={suggested.toFixed(2)}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The run also stops when the monthly AI budget is used up. Start it again later to continue: vendors already checked are skipped.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!p || !lookups || !(maxUsd > 0) || start.isPending} onClick={() => start.mutate()}>
            <Sparkles /> {start.isPending ? "Starting…" : `Start (${lookups.toLocaleString()} look-ups)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function failure(j: JobRead): string {
  const message = (j.error as { message?: string } | null)?.message ?? "";
  // A worker running older code took the job: it can only run once every worker has the new version.
  if (message.startsWith("No handler registered"))
    return "A background worker running an older version of the app picked this run up and could not do it. Deploy the latest version of the backend, then start the run again.";
  return message || "The run failed.";
}

/** The current or last run: live progress, counts per detail, spend, Stop. */
function RunCard({ jobId, onHide }: { jobId: string; onHide: () => void }) {
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api<JobRead>(`/jobs/${jobId}`) });
  const done = Boolean(job.data && TERMINAL_JOB_STATUSES.has(job.data.status));
  useLiveJob(jobId, !done);
  // When the run ends, the start button and the counts of what is left refresh.
  useEffect(() => {
    if (done) void queryClient.invalidateQueries({ queryKey: PLAN_KEY });
  }, [done, queryClient]);
  const stop = useMutation({
    mutationFn: () => api<JobRead>(`/jobs/${jobId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Stopping after the current batch. What was found so far is kept.");
      void queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (job.isPending) return <Skeleton className="h-28" />;
  if (!job.data) return null;
  const j = job.data;
  const r = (j.result ?? null) as RunResult | null;
  const found = r ? Object.values(r.counts).reduce((n, c) => n + (c.proposed ?? 0), 0) : 0;
  const status =
    j.status === "running" || j.status === "queued"
      ? j.status === "queued"
        ? "Waiting for a worker"
        : "Running"
      : j.status === "cancelled"
        ? "Stopped"
        : j.status === "failed"
          ? "Failed"
          : r?.stopped === "limit"
            ? "Stopped at the spending limit"
            : r?.stopped === "budget"
              ? "Stopped: AI budget used up"
              : "Finished";
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> AI run on all vendors
            <Badge variant={done ? "secondary" : "default"}>{status}</Badge>
          </CardTitle>
          <CardDescription>
            {r ? `${r.checked.toLocaleString()} of ${r.total.toLocaleString()} look-ups done` : "Preparing…"}
            {r && ` · ${found.toLocaleString()} found, waiting in Approvals`}
            {r && ` · ${usd(r.spent_usd)} spent${r.max_usd ? ` of ${usd(r.max_usd)} limit` : ""}`}
            {j.finished_at && ` · finished ${formatDateTime(j.finished_at)}`}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {found > 0 && (
            <Button size="sm" variant="outline" render={<Link href="/admin/proposals" />}>
              Review in Approvals
            </Button>
          )}
          {!done ? (
            <Button size="sm" variant="outline" disabled={stop.isPending || j.cancel_requested} onClick={() => stop.mutate()}>
              <Square /> {j.cancel_requested ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <Button size="icon-sm" variant="ghost" aria-label="Hide this run" onClick={onHide}>
              <X />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary transition-all" style={{ width: `${j.progress}%` }} />
        </div>
        {!done && j.stage && (
          <p className="text-xs text-muted-foreground">
            Now: {j.stage}
            {r?.parallel ? ` (up to ${r.parallel} at a time)` : ""}
          </p>
        )}
        {j.status === "failed" && <p className="text-sm text-destructive">{failure(j)}</p>}
        {r && (
          <div className="grid gap-2 sm:grid-cols-4">
            {r.fields.map((f) => {
              const c = r.counts[f] ?? {};
              const checked = Object.values(c).reduce((a, b) => a + b, 0);
              return (
                <div key={f} className="rounded-md border p-2 text-xs">
                  <div className="font-medium text-foreground">{LABEL[f] ?? f}</div>
                  <div className="text-muted-foreground tabular-nums">
                    {checked.toLocaleString()} of {(r.planned[f] ?? 0).toLocaleString()} checked
                  </div>
                  <div className="tabular-nums">
                    <span className="text-emerald-700 dark:text-emerald-400">{(c.proposed ?? 0).toLocaleString()} found</span>
                    {" · "}
                    {((c.not_found ?? 0) + (c.rejected ?? 0)).toLocaleString()} not found or unsure
                    {(c.failed ?? 0) > 0 && <span className="text-destructive"> · {c.failed} failed</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** SOW 7 / 8.7: AI on the whole knowledge base, as a background job with live progress (curators). */
export function EnrichAll() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const plan = useQuery({ queryKey: [...PLAN_KEY, "status"], queryFn: () => api<Plan>("/admin/vendor-enrichment"), staleTime: 30_000 });
  const jobId = started ?? plan.data?.running_job_id ?? plan.data?.last_job_id ?? null;
  return (
    <div className="mb-4 grid gap-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={!plan.data || Boolean(plan.data.running_job_id)}
          title={plan.data?.running_job_id ? "A run is in progress" : undefined}
          onClick={() => setOpen(true)}
        >
          <Sparkles /> Run AI on all vendors
        </Button>
      </div>
      {jobId && jobId !== hidden && <RunCard key={jobId} jobId={jobId} onHide={() => setHidden(jobId)} />}
      {open && (
        <StartDialog
          open={open}
          onOpenChange={setOpen}
          onStarted={(id) => {
            setStarted(id);
            setHidden(null);
          }}
        />
      )}
    </div>
  );
}
