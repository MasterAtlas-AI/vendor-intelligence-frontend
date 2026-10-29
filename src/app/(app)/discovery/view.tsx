"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Sparkles } from "lucide-react";
import Link from "next/link";

import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { CursorPage, JobRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { DISCOVERY_TYPES, KIND_LABELS, jobTitle } from "@/lib/discovery";
import { humanize, timeAgo } from "@/lib/format";

function resultLine(job: JobRead): string {
  if (job.status === "running") return `${job.progress}% · ${humanize(job.stage ?? "starting").toLowerCase()}`;
  const r = (job.result ?? {}) as Record<string, unknown>;
  const counts = (r.counts ?? {}) as Record<string, number>;
  if (job.type === "vendor_discovery") {
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([o, n]) => `${n} ${humanize(o).toLowerCase()}`)
      .join(" · ");
  }
  if (r.proposal_id) return "New facts sent for review";
  return job.status === "succeeded" ? "Nothing new found" : "";
}

export default function DiscoveryRunsPage() {
  const canRun = useCan(P.DISCOVERY_RUN);
  const actAs = useAuth((s) => s.actAs);
  const jobs = useQuery({
    queryKey: ["jobs", "discovery", actAs?.id],
    queryFn: async ({ signal }) => {
      const pages = await Promise.all(
        DISCOVERY_TYPES.map((type) => api<CursorPage<JobRead>>("/jobs", { query: { type, limit: 25 }, signal })),
      );
      return pages.flatMap((p) => p.items).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    enabled: canRun,
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "queued" || j.status === "running") ? 3000 : false),
  });
  if (!canRun) return <NoAccess what="AI discovery" />;

  return (
    <>
      <PageHeader
        title="AI discovery"
        description="Find new suppliers on the web, or research a known vendor's website from its page. Everything found goes to curator review."
        actions={
          <Button render={<Link href="/discovery/new" />}>
            <Sparkles /> Discover vendors
          </Button>
        }
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Search</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {jobs.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center whitespace-normal text-muted-foreground">
                  No discovery runs yet. Start one with “Discover vendors”, or open a vendor and use “Research with AI”.
                </TableCell>
              </TableRow>
            )}
            {jobs.data?.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="max-w-sm">
                  <Link href={`/discovery/${j.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                    {j.type === "vendor_discovery" ? (
                      <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{jobTitle(j)}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{KIND_LABELS[j.type] ?? humanize(j.type)}</TableCell>
                <TableCell>
                  <StatusBadge status={j.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{resultLine(j) || "—"}</TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {j.cost_usd ? `$${Number(j.cost_usd).toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{timeAgo(j.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
