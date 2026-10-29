"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Radio } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TERMINAL_JOB_STATUSES, useLiveJob } from "@/hooks/use-live-job";
import { api } from "@/lib/api/client";
import type { JobRead } from "@/lib/api/types";
import { formatDateTime, humanize } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ["job", id], queryFn: () => api<JobRead>(`/jobs/${id}`) });
  const finished = job.data ? TERMINAL_JOB_STATUSES.has(job.data.status) : true;
  const live = useLiveJob(id, Boolean(job.data) && !finished);

  const cancel = useMutation({
    mutationFn: () => api<JobRead>(`/jobs/${id}/cancel`, { method: "POST" }),
    onSuccess: (j) => {
      queryClient.setQueryData(["job", id], j);
      toast.success(j.status === "cancelled" ? "Job cancelled" : "Cancellation requested");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (job.isPending) return <Skeleton className="h-64" />;
  if (job.isError || !job.data) {
    return <p className="text-sm text-muted-foreground">{errorMessage(job.error)}</p>;
  }
  const j = job.data;

  return (
    <>
      <Link href="/jobs" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> All jobs
      </Link>
      <PageHeader
        title={humanize(j.type)}
        description={`Job ${j.id}`}
        actions={
          !finished && (
            <Button variant="outline" disabled={cancel.isPending || j.cancel_requested} onClick={() => cancel.mutate()}>
              {j.cancel_requested ? "Cancelling…" : "Cancel job"}
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <StatusBadge status={j.status} />
              {j.stage && <span className="text-sm font-normal text-muted-foreground">{humanize(j.stage)}</span>}
            </CardTitle>
            {live && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Radio className="size-3.5 animate-pulse" /> Live
              </span>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            <ProgressBar value={j.progress} />
            {j.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="font-medium text-destructive">{String(j.error.code ?? "Error")}</div>
                <div>{String(j.error.message ?? "")}</div>
              </div>
            )}
            {j.result && (
              <div>
                <div className="mb-1 text-sm font-medium">Result</div>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(j.result, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(j.created_at)}</dd>
              <dt className="text-muted-foreground">Started</dt>
              <dd>{formatDateTime(j.started_at)}</dd>
              <dt className="text-muted-foreground">Finished</dt>
              <dd>{formatDateTime(j.finished_at)}</dd>
              <dt className="text-muted-foreground">Attempts</dt>
              <dd>
                {j.attempts} of {j.max_attempts}
              </dd>
              <dt className="text-muted-foreground">Input</dt>
              <dd>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(j.input, null, 2)}</pre>
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
