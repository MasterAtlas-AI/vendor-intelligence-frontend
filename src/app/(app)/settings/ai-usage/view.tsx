"use client";

import { useQuery } from "@tanstack/react-query";

import { NoAccess, PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { AiUsage } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/validation";

// Prompt names (app/discovery/prompts.py) in words.
const PROMPT_LABELS: Record<string, string> = {
  discovery_plan: "Planning searches",
  discovery_search: "Web searches",
  discovery_extract: "Reading supplier websites",
  taxonomy_classify: "Classifying",
  discovery_profile: "Researching known vendors",
  dedup_judge: "Checking duplicates",
  health_check: "Connection checks",
  "embed:search_query": "Search (meaning-based matching)",
  "embed:vendor_index": "Building the search index",
  search_parse: "Understanding searches",
};

const usd = (v: string | number) => `US$${Number(v).toFixed(2)}`;

export default function AiUsagePage() {
  const canRun = useCan(P.DISCOVERY_RUN);
  const actAs = useAuth((s) => s.actAs);
  const owner = useAuth((s) => actAs?.name ?? s.user?.tenant?.name ?? "Platform staff");
  const usage = useQuery({
    queryKey: ["ai-usage", actAs?.id],
    queryFn: () => api<AiUsage>("/ai/usage"),
    enabled: canRun,
  });
  if (!canRun) return <NoAccess what="AI usage" />;

  return (
    <>
      <PageHeader title="AI usage" description={`Spending on AI discovery this month · ${owner}`} />
      {usage.isPending && <Skeleton className="h-48" />}
      {usage.isError && <p className="text-sm text-muted-foreground">{errorMessage(usage.error)}</p>}
      {usage.data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Monthly budget</CardTitle>
              <CardDescription>
                Since {new Date(usage.data.month_start).toLocaleDateString(undefined, { dateStyle: "medium" })}. Runs stop before
                going over it; a platform admin can raise it.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <ProgressBar
                value={Math.min(100, Math.round((Number(usage.data.spent_usd) / Math.max(Number(usage.data.budget_usd), 0.01)) * 100))}
                label={`${usd(usage.data.spent_usd)} of ${usd(usage.data.budget_usd)}`}
              />
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">Remaining</dt>
                <dd className="font-medium tabular-nums">{usd(usage.data.remaining_usd)}</dd>
                <dt className="text-muted-foreground">AI calls</dt>
                <dd className="tabular-nums">{usage.data.calls}</dd>
                <dt className="text-muted-foreground">Model</dt>
                <dd>{usage.data.configured ? (usage.data.model ?? "—") : "Not configured"}</dd>
              </dl>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Where it went</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Step</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage.data.by_prompt.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                          No AI use this month.
                        </TableCell>
                      </TableRow>
                    )}
                    {usage.data.by_prompt.map((p) => (
                      <TableRow key={p.prompt}>
                        <TableCell>{PROMPT_LABELS[p.prompt] ?? PROMPT_LABELS[p.prompt.split("@")[0]] ?? p.prompt}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.calls}</TableCell>
                        <TableCell className="text-right tabular-nums">{usd(p.cost_usd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
