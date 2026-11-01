"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { BarList, StatTile } from "@/components/analytics/bar-list";
import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { OrganizationAnalytics } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { humanize } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

export default function AnalyticsPage() {
  const actAs = useAuth((s) => s.actAs);
  const [days, setDays] = useState("");
  const period = days || "30";
  const data = useQuery({
    queryKey: ["analytics", actAs?.id, period],
    queryFn: () => api<OrganizationAnalytics>("/analytics", { query: { days: period } }),
  });
  const d = data.data;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Your vendor list and how your organization uses MasterAtlas."
        actions={<FilterSelect label="Period" anyLabel="Last 30 days" value={days} onChange={setDays} options={PERIODS} className="w-40" />}
      />
      {data.isPending && <Skeleton className="h-64" />}
      {data.isError && <p className="text-sm text-destructive">{errorMessage(data.error)}</p>}
      {d && (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Vendors on your list" value={d.vendors.toLocaleString()} />
            <StatTile label="Searches" value={d.searches.toLocaleString()} hint={`in the last ${d.days} days`} />
            <StatTile label="AI discovery runs" value={d.discovery_runs.toLocaleString()} hint={`in the last ${d.days} days`} />
            <StatTile
              label="AI spend this month"
              value={`US$${d.ai_spend_month.toFixed(2)}`}
              hint={`of US$${d.ai_budget_month.toFixed(2)} budget`}
            />
            <StatTile label="Active projects" value={d.active_projects.toLocaleString()} hint={`${d.reports} reports in the period`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarList title="By AVL status" items={d.by_avl_status} labelFor={(s) => humanize(s)} empty="No vendors on your list yet." />
            <BarList title="By equipment category" description="Vendors on your list with approved equipment in each category." items={d.by_category} />
            <BarList title="By country" description="Headquarters country." items={d.by_country} labelFor={(c) => (c === "Unknown" ? c : countryName(c))} />
            <BarList title="RFQs by status" items={d.rfqs_by_status} labelFor={(s) => humanize(s)} empty="No RFQs yet." />
          </div>
        </div>
      )}
    </>
  );
}
