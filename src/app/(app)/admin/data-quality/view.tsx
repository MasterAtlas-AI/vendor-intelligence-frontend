"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

type Dashboard = components["schemas"]["QualityDashboard"];
type Reverify = components["schemas"]["ReverifyResult"];

const pct = (score: number) => `${Math.round(score * 100)}%`;

export default function DataQualityPage() {
  const canReview = useCan(P.KNOWLEDGE_APPROVE);
  const queryClient = useQueryClient();
  const [issue, setIssue] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const board = useQuery({
    queryKey: ["data-quality", issue],
    queryFn: () => api<Dashboard>("/admin/data-quality", { query: { issue, limit: 100 } }),
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
              <CardDescription>Click an issue to list the vendors that have it.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant={issue === null ? "default" : "outline"} onClick={() => setIssue(null)}>
                Weakest overall
              </Button>
              {d.issues.map((i) => (
                <Button key={i.key} size="sm" variant={issue === i.key ? "default" : "outline"} onClick={() => setIssue(i.key)}>
                  {i.label} <span className="tabular-nums">{i.count.toLocaleString()}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-24 text-right">Score</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.worst.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      No vendors with this issue.
                    </TableCell>
                  </TableRow>
                )}
                {d.worst.map((v) => (
                  <TableRow key={v.vendor_id}>
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
