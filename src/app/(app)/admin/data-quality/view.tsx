"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, ScanSearch, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoAccess, PageHeader } from "@/components/page-header";
import { type AiAction, AiChecks, AiFillBar, MAX_AI_SELECTED } from "@/components/quality/ai-fill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

type Dashboard = components["schemas"]["QualityDashboard"];
type Reverify = components["schemas"]["ReverifyResult"];

const pct = (score: number) => `${Math.round(score * 100)}%`;
const ALL_ACTIONS: AiAction[] = ["website", "hq_country", "description", "contacts", "research"];
/** The AI action that fixes each list comes first; lists without their own research the websites. */
const MAIN_ACTION: Record<string, AiAction> = { no_website: "website", no_country: "hq_country", no_description: "description" };
const actionsFor = (issue: string | null): AiAction[] => {
  const main = (issue && MAIN_ACTION[issue]) || "research";
  // Vendors without a website have nothing to research yet.
  return [main, ...ALL_ACTIONS.filter((a) => a !== main && !(issue === "no_website" && a === "research"))];
};

export default function DataQualityPage() {
  const canReview = useCan(P.KNOWLEDGE_APPROVE);
  const queryClient = useQueryClient();
  const [issue, setIssue] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideChecked, setHideChecked] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const board = useQuery({
    queryKey: ["data-quality", issue, hideChecked, q],
    queryFn: () =>
      api<Dashboard>("/admin/data-quality", { query: { issue, limit: 100, hide_checked: hideChecked || undefined, q: q || undefined } }),
    placeholderData: (previous) => previous,
    enabled: canReview,
  });
  const rescore = useMutation({
    mutationFn: () => api<{ updated: number }>("/admin/data-quality/rescore", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`Scores recalculated (${r.updated} changed)`);
      void queryClient.invalidateQueries({ queryKey: ["data-quality"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reverify = useMutation({
    mutationFn: () => api<Reverify>("/admin/data-quality/reverify", { method: "POST", body: { limit: 10 } }),
    onSuccess: (r) => {
      setConfirm(false);
      toast.success(r.queued ? `Re-checking ${r.queued} vendor websites. New facts go to Approvals.` : "No stale vendors with a website to re-check");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canReview) return <NoAccess what="the data-quality dashboard" />;
  const d = board.data;
  const rows = d?.worst ?? [];
  const pickable = rows.slice(0, MAX_AI_SELECTED);
  const allPicked = pickable.length > 0 && pickable.every((v) => selected.has(v.vendor_id));
  const toggle = (id: string, on: boolean) => {
    if (on && selected.size >= MAX_AI_SELECTED) {
      toast.error(`Up to ${MAX_AI_SELECTED} vendors at a time`);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const chooseIssue = (key: string | null) => {
    setIssue(key);
    setSelected(new Set());
  };

  return (
    <>
      <PageHeader
        title="Data quality"
        description="How complete, sourced and fresh the knowledge base is, and which vendors need attention."
        actions={
          <>
            <Button variant="outline" disabled={rescore.isPending} onClick={() => rescore.mutate()}>
              <RefreshCcw /> Recalculate
            </Button>
            <Button variant="outline" onClick={() => setConfirm(true)}>
              <ScanSearch /> Re-check stale vendors
            </Button>
          </>
        }
      />
      {board.isPending && <Skeleton className="h-64" />}
      {board.isError && <p className="text-sm text-destructive">{errorMessage(board.error)}</p>}
      {d && (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Vendors</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{d.vendors.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Average score</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{pct(d.avg_score)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Good (70%+)</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{(d.distribution.high ?? 0).toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Weak (under 40%)</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{(d.distribution.low ?? 0).toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Issues</CardTitle>
              <CardDescription>Click an issue to list the vendors that have it, then tick vendors to fix with AI.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant={issue === null ? "default" : "outline"} onClick={() => chooseIssue(null)}>
                Weakest overall
              </Button>
              {d.issues.map((i) => (
                <Button key={i.key} size="sm" variant={issue === i.key ? "default" : "outline"} onClick={() => chooseIssue(i.key)}>
                  {i.label} <span className="tabular-nums">{i.count.toLocaleString()}</span>
                </Button>
              ))}
              <div className="relative ml-auto w-full sm:w-64">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search vendors"
                  placeholder="Search vendor name"
                  className="h-8 pl-8"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelected(new Set());
                  }}
                />
              </div>
              <Label className="flex items-center gap-2 font-normal text-muted-foreground">
                <Checkbox
                  aria-label="Hide vendors the AI already checked"
                  checked={hideChecked}
                  onCheckedChange={(c) => {
                    setHideChecked(Boolean(c));
                    setSelected(new Set());
                  }}
                />
                Hide vendors the AI already checked
              </Label>
            </CardContent>
          </Card>
          {rows.length > 0 && (
            <AiFillBar
              selected={[...selected]}
              actions={actionsFor(issue)}
              onStarted={() => setSelected(new Set())}
              hint={`Tick up to ${MAX_AI_SELECTED} vendors, then let the AI fill the gaps.`}
            />
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={`Select the first ${pickable.length} vendors`}
                      checked={allPicked}
                      indeterminate={selected.size > 0 && !allPicked}
                      disabled={!pickable.length}
                      onCheckedChange={(c) => setSelected(c ? new Set(pickable.map((v) => v.vendor_id)) : new Set())}
                    />
                  </TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-24 text-right">Score</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead className="w-56">Last AI check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.worst.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      {q
                        ? `No vendor matching "${q}" in this list.`
                        : hideChecked
                          ? "Every vendor in this list has been checked by the AI."
                          : "No vendors with this issue."}
                    </TableCell>
                  </TableRow>
                )}
                {d.worst.map((v) => (
                  <TableRow key={v.vendor_id} data-state={selected.has(v.vendor_id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${v.name}`}
                        checked={selected.has(v.vendor_id)}
                        onCheckedChange={(c) => toggle(v.vendor_id, Boolean(c))}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/vendors/${v.vendor_id}`} className="font-medium hover:underline">
                        {v.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{countryName(v.country)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct(v.score)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {v.issues.map((key) => (
                          <Badge key={key} variant="secondary">
                            {d.issues.find((i) => i.key === key)?.label ?? key}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AiChecks checks={v.ai_checks} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Re-check the 10 stalest vendors?"
        description="The AI re-reads each vendor's website (a few cents each, from the platform AI budget). New or changed facts go to Approvals for review; nothing changes without a curator."
        confirmLabel="Re-check"
        pending={reverify.isPending}
        onConfirm={() => reverify.mutate()}
      />
    </>
  );
}
