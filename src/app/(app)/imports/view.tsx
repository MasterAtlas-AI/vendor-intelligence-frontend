"use client";

import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Upload } from "lucide-react";
import Link from "next/link";

import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { CursorPage, JobRead, ProposalPage } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize, timeAgo } from "@/lib/format";
import { originLabel } from "@/lib/vendors";

const IMPORT_TYPES = ["excel_import", "pdf_import"] as const;

/** "3 matched · 2 sent for review" from an import job's result counts. */
function countsLine(job: JobRead): string {
  const counts = (job.result?.counts ?? {}) as Record<string, number>;
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([outcome, n]) => `${n} ${humanize(outcome).toLowerCase()}`)
    .join(" · ");
}

function useImportJobs() {
  const actAs = useAuth((s) => s.actAs);
  return useQuery({
    queryKey: ["jobs", "imports", actAs?.id],
    queryFn: async ({ signal }) => {
      // Two small queries (the jobs API filters by one type at a time), merged newest first.
      const pages = await Promise.all(
        IMPORT_TYPES.map((type) => api<CursorPage<JobRead>>("/jobs", { query: { type, limit: 25 }, signal })),
      );
      return pages.flatMap((p) => p.items).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "queued" || j.status === "running") ? 3000 : false),
  });
}

function MyProposals() {
  const actAs = useAuth((s) => s.actAs);
  const proposals = useQuery({
    queryKey: ["proposals", "mine", actAs?.id],
    queryFn: () => api<ProposalPage>("/proposals/mine", { query: { limit: 10 } }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sent for review</CardTitle>
        <CardDescription>
          New vendors and facts from your imports go to the MasterAtlas curators before they join the shared
          knowledge base. Approved vendors are added to your list automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {proposals.isPending && <Skeleton className="h-16" />}
        {proposals.data?.items.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
        {proposals.data?.items.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {p.subject_vendor_id ? (
                  <Link href={`/vendors/${p.subject_vendor_id}`} className="hover:underline">
                    {p.title}
                  </Link>
                ) : (
                  p.title
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {humanize(p.kind)} · {originLabel(p.origin)} · {timeAgo(p.created_at)}
              </div>
            </div>
            <StatusBadge status={p.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ImportsPage() {
  const canImport = useCan(P.UPLOAD_CREATE);
  const hasTenant = useAuth((s) => Boolean(s.user?.tenant || s.actAs));
  const jobs = useImportJobs();
  if (!canImport) return <NoAccess what="imports" />;

  return (
    <>
      <PageHeader
        title="Imports"
        description="Bring vendors in from your own spreadsheets and vendor documents."
        actions={
          <Button render={<Link href="/imports/new" />}>
            <Upload /> New import
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.isPending && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {jobs.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center whitespace-normal text-muted-foreground">
                    No imports yet. Upload an Excel/CSV vendor list or a vendor PDF to start.
                  </TableCell>
                </TableRow>
              )}
              {jobs.data?.map((j) => {
                const Icon = j.type === "pdf_import" ? FileText : FileSpreadsheet;
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link href={`/imports/${j.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                        <Icon className="size-4 text-muted-foreground" />
                        {String(j.input.filename ?? humanize(j.type))}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {j.status === "running" ? `${j.progress}%` : countsLine(j) || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{timeAgo(j.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {hasTenant && <MyProposals />}
      </div>
    </>
  );
}
