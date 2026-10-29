"use client";

import { useQuery } from "@tanstack/react-query";
import { FilePlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import { NewRfqDialog } from "@/components/rfqs/new-rfq-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { Rfq } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize, timeAgo } from "@/lib/format";
import { RFQ_STATUSES } from "@/lib/rfqs";

export default function RfqsPage() {
  const canCreate = useCan(P.RFQ_MANAGE);
  const actAs = useAuth((s) => s.actAs);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const rfqs = useQuery({
    queryKey: ["rfqs", actAs?.id, status],
    queryFn: () => api<Rfq[]>("/rfqs", { query: { status } }),
  });

  return (
    <>
      <PageHeader
        title="RFQs"
        description="Requests for quotation: invite vendors, record their quotes, compare them with scorecards and award."
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <FilePlus /> New RFQ
            </Button>
          )
        }
      />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          anyLabel="Any status"
          value={status}
          onChange={setStatus}
          options={RFQ_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
        />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>RFQ</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Quoted / vendors</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rfqs.isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {rfqs.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center whitespace-normal text-muted-foreground">
                  No RFQs yet. Create one here or from a project&apos;s shortlist.
                </TableCell>
              </TableRow>
            )}
            {rfqs.data?.map((r) => {
              const counts = r.vendor_counts ?? {};
              const total = Object.values(counts).reduce((a, b) => a + b, 0);
              const quoted = (counts.quoted ?? 0) + (counts.awarded ?? 0) + (counts.lost ?? 0);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/rfqs/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.rfq_number}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.project_name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {quoted} / {total}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.due_date ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timeAgo(r.updated_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <NewRfqDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
