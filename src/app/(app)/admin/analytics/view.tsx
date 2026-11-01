"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { BarList, StatTile } from "@/components/analytics/bar-list";
import { FilterSelect } from "@/components/filter-select";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { PlatformAnalytics } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";
import { countryName, originLabel } from "@/lib/vendors";

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

function hours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
}

export default function PlatformAnalyticsPage() {
  const canView = useCan(P.KNOWLEDGE_APPROVE);
  const [days, setDays] = useState("");
  const period = days || "30";
  const data = useQuery({
    queryKey: ["platform-analytics", period],
    queryFn: () => api<PlatformAnalytics>("/admin/analytics", { query: { days: period } }),
    enabled: canView,
  });
  if (!canView) return <NoAccess what="platform analytics" />;
  const d = data.data;
  const kb = d?.knowledge_base;
  const funnel = d?.discovery_funnel;

  return (
    <>
      <PageHeader
        title="Platform analytics"
        description="Knowledge-base coverage, the AI discovery funnel, approval turnaround and usage by organization."
        actions={<FilterSelect label="Period" anyLabel="Last 30 days" value={days} onChange={setDays} options={PERIODS} className="w-40" />}
      />
      {data.isPending && <Skeleton className="h-64" />}
      {data.isError && <p className="text-sm text-destructive">{errorMessage(data.error)}</p>}
      {d && kb && funnel && (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Active vendors" value={kb.vendors.toLocaleString()} hint={`${kb.added.toLocaleString()} added in the last ${d.days} days`} />
            <StatTile
              label="With approved equipment"
              value={kb.with_equipment.toLocaleString()}
              hint={kb.vendors ? `${Math.round((kb.with_equipment / kb.vendors) * 100)}% of vendors` : undefined}
            />
            <StatTile label="Average data quality" value={`${Math.round(kb.avg_quality * 100)}%`} />
            <StatTile label="Discovery runs" value={funnel.runs.toLocaleString()} hint={`US$${funnel.cost_usd.toFixed(2)} in the last ${d.days} days`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarList
              title="AI discovery funnel"
              description={`Last ${d.days} days. ${funnel.discarded.toLocaleString()} candidates discarded, ${funnel.rejected} proposals rejected, ${funnel.pending} still pending.`}
              items={funnel.steps}
              empty="No discovery runs in this period."
            />
            <BarList title="Coverage by equipment category" description="Active vendors with approved equipment in each top-level category." items={kb.by_category} />
            <BarList title="Vendors by country" items={kb.by_country} labelFor={(c) => (c === "Unknown" ? c : countryName(c))} />
            <BarList title="Most common certifications" items={kb.top_certifications} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Approval turnaround</CardTitle>
              <CardDescription>
                Time from proposal to curator decision in the last {d.days} days (automatic approvals excluded), and what is waiting now.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Decided</TableHead>
                      <TableHead className="text-right">Median</TableHead>
                      <TableHead className="text-right">90% within</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right">Oldest pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.approvals.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                          No proposals yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {d.approvals.map((a) => (
                      <TableRow key={a.origin}>
                        <TableCell>{originLabel(a.origin)}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.decided}</TableCell>
                        <TableCell className="text-right tabular-nums">{hours(a.median_hours)}</TableCell>
                        <TableCell className="text-right tabular-nums">{hours(a.p90_hours)}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.pending}</TableCell>
                        <TableCell className="text-right tabular-nums">{hours(a.oldest_pending_hours)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Organizations</CardTitle>
              <CardDescription>Activity in the last {d.days} days; AI spend is this calendar month.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead className="text-right">Users</TableHead>
                      <TableHead className="text-right">Vendors</TableHead>
                      <TableHead className="text-right">Searches</TableHead>
                      <TableHead className="text-right">Discovery runs</TableHead>
                      <TableHead className="text-right">Projects</TableHead>
                      <TableHead className="text-right">RFQs</TableHead>
                      <TableHead className="text-right">AI spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.organizations.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <span className="font-medium">{o.name}</span> <StatusBadge status={o.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{o.users}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.vendors.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.searches}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.discovery_runs}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.projects}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.rfqs}</TableCell>
                        <TableCell className="text-right tabular-nums">US${o.ai_spend_month.toFixed(2)}</TableCell>
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
