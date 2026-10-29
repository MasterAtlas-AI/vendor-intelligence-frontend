"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, LockOpen, Save } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import type { Scorecard } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

type Draft = Record<string, { score: string; comment: string }>;

function toDraft(card: Scorecard): Draft {
  return Object.fromEntries(
    card.criteria.map((c) => {
      const s = card.scores[c.key];
      return [c.key, { score: s?.score === null || s?.score === undefined ? "" : String(s.score), comment: s?.comment ?? "" }];
    }),
  );
}

/** Same formula as the backend: weighted mean of the scored criteria (0-10), shown on 0-100. */
function liveTotal(card: Scorecard, draft: Draft): number | null {
  const scored = card.criteria
    .map((c) => ({ w: c.weight, s: draft[c.key]?.score }))
    .filter((x) => x.s !== "" && x.s !== undefined && !Number.isNaN(Number(x.s)));
  if (!scored.length) return null;
  const weight = scored.reduce((a, x) => a + x.w, 0);
  return (scored.reduce((a, x) => a + x.w * Number(x.s), 0) / weight) * 10;
}

export default function ScorecardPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const canScore = useCan(P.SCORECARD_MANAGE);
  const card = useQuery({ queryKey: ["scorecard", id], queryFn: () => api<Scorecard>(`/scorecards/${id}`) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [forVersion, setForVersion] = useState<number | null>(null);
  if (card.data && forVersion !== card.data.version) {
    // Load (or reload after a save) the server's values into the form.
    setForVersion(card.data.version);
    setDraft(toDraft(card.data));
    setNotes(card.data.notes);
  }

  const save = useMutation({
    mutationFn: (status?: "draft" | "final") => {
      const c = card.data!;
      const scores = Object.fromEntries(
        Object.entries(draft ?? {}).map(([k, v]) => [k, { score: v.score === "" ? null : Number(v.score), comment: v.comment }]),
      );
      const body: Record<string, unknown> = { version: c.version };
      if (c.status === "draft") Object.assign(body, { scores, notes: notes ?? "" });
      if (status) body.status = status;
      return api<Scorecard>(`/scorecards/${id}`, { method: "PATCH", body });
    },
    onSuccess: (c, status) => {
      queryClient.setQueryData(["scorecard", id], c);
      if (c.project_id) void queryClient.invalidateQueries({ queryKey: ["project-vendors", c.project_id] });
      toast.success(status === "final" ? "Scorecard finalised" : status === "draft" ? "Reopened as a draft" : "Saved");
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (e instanceof ApiError && e.code === "version_conflict") void card.refetch();
    },
  });

  if (card.isPending || !draft) return <Skeleton className="h-64" />;
  if (card.isError) return <p className="text-sm text-muted-foreground">{errorMessage(card.error)}</p>;
  const c = card.data;
  const editable = canScore && c.status === "draft";
  const total = editable ? liveTotal(c, draft) : c.total_score === null ? null : Number(c.total_score);
  const invalid = Object.values(draft).some((v) => v.score !== "" && (Number.isNaN(Number(v.score)) || Number(v.score) < 0 || Number(v.score) > 10));

  return (
    <>
      <Link
        href={c.project_id ? `/projects/${c.project_id}` : `/vendors/${c.vendor_id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> {c.project_name ?? c.vendor_name}
      </Link>
      <PageHeader
        title={`${c.vendor_name}: ${c.title}`}
        description={`${c.project_name ? `Project ${c.project_name} · ` : ""}updated ${formatDateTime(c.updated_at)}`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {canScore && c.status === "draft" && (
              <Button variant="outline" disabled={save.isPending || invalid || total === null} onClick={() => save.mutate("final")}>
                <Lock /> Finalise
              </Button>
            )}
            {canScore && c.status === "final" && (
              <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate("draft")}>
                <LockOpen /> Reopen
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <Card>
          <CardHeader>
            <CardTitle>Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criterion</TableHead>
                    <TableHead className="w-20 text-right">Weight</TableHead>
                    <TableHead className="w-24">Score (0–10)</TableHead>
                    <TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.criteria.map((cr) => (
                    <TableRow key={cr.key} className="align-top">
                      <TableCell className="max-w-56 whitespace-normal">
                        <div className="font-medium">{cr.label}</div>
                        {cr.description && <div className="text-xs text-muted-foreground">{cr.description}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{cr.weight}</TableCell>
                      <TableCell>
                        {editable ? (
                          <Input
                            aria-label={`Score for ${cr.label}`}
                            type="number"
                            min={0}
                            max={10}
                            step={0.5}
                            value={draft[cr.key]?.score ?? ""}
                            onChange={(e) => setDraft({ ...draft, [cr.key]: { ...draft[cr.key]!, score: e.target.value } })}
                          />
                        ) : (
                          <span className="tabular-nums">{draft[cr.key]?.score || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {editable ? (
                          <Input
                            aria-label={`Comment for ${cr.label}`}
                            value={draft[cr.key]?.comment ?? ""}
                            maxLength={2000}
                            onChange={(e) => setDraft({ ...draft, [cr.key]: { ...draft[cr.key]!, comment: e.target.value } })}
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">{draft[cr.key]?.comment || "—"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Total</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="text-4xl font-semibold tabular-nums">{total === null ? "—" : total.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">Out of 100, weighted over the criteria scored so far.</p>
              {invalid && <p className="text-xs text-destructive">Scores must be between 0 and 10.</p>}
              {editable && (
                <Button disabled={save.isPending || invalid} onClick={() => save.mutate(undefined)}>
                  <Save /> {save.isPending ? "Saving…" : "Save"}
                </Button>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <Label htmlFor="scorecard-notes">Notes</Label>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editable ? (
                <Textarea id="scorecard-notes" rows={6} maxLength={5000} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
              ) : (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.notes || "—"}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
