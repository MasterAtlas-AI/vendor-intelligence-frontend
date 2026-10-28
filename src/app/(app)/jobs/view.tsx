"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { LoadMore } from "@/components/load-more";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { CursorPage, JobAccepted, JobRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

export default function JobsPage() {
  const router = useRouter();
  const actAs = useAuth((s) => s.actAs);
  const canRunDiagnostics = useCan(P.TENANT_MANAGE);

  const jobs = useInfiniteQuery({
    queryKey: ["jobs", "list", actAs?.id],
    queryFn: ({ pageParam, signal }) =>
      api<CursorPage<JobRead>>("/jobs", { query: { limit: 25, cursor: pageParam }, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // Keep the list fresh while anything is still in progress.
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.items.some((j) => j.status === "queued" || j.status === "running"))
        ? 3000
        : false,
  });

  const diagnostics = useMutation({
    mutationFn: () =>
      api<JobAccepted>("/admin/jobs/diagnostics", {
        method: "POST",
        body: { steps: 5, step_seconds: 1 },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: (j) => router.push(`/jobs/${j.job_id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = jobs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Background jobs"
        description="Imports, AI discovery and other long-running work. Open a job to follow it live."
        actions={
          canRunDiagnostics && (
            <Button variant="outline" disabled={diagnostics.isPending} onClick={() => diagnostics.mutate()}>
              <Activity /> Run diagnostics job
            </Button>
          )
        }
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Attempts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.isPending && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {!jobs.isPending && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No jobs yet. They appear here when you start imports or AI discovery.
                </TableCell>
              </TableRow>
            )}
            {rows.map((j) => (
              <TableRow key={j.id}>
                <TableCell>
                  <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                    {humanize(j.type)}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{j.id.slice(0, 8)}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={j.status} />
                </TableCell>
                <TableCell className="text-sm">
                  {j.progress}%{j.stage ? <span className="text-muted-foreground"> · {humanize(j.stage)}</span> : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{timeAgo(j.created_at)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {j.attempts}/{j.max_attempts}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <LoadMore hasNextPage={jobs.hasNextPage} isFetchingNextPage={jobs.isFetchingNextPage} fetchNextPage={jobs.fetchNextPage} />
    </>
  );
}
