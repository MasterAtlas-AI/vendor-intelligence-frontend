"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { CursorPage, JobRead, TenantRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize, timeAgo } from "@/lib/format";

const NEXT_UP = [
  "Vendor knowledge base, Excel/PDF import and the approval workflow (Phase 2)",
  "AI discovery of vendors, equipment and services (Phase 3)",
  "Semantic search, scorecards and the AI assistant (Phase 4)",
];

export default function DashboardPage() {
  const user = useAuth((s) => s.user)!;
  const actAs = useAuth((s) => s.actAs);
  const canManageUsers = useCan(P.USER_READ);
  const hasTenant = Boolean(user.tenant || actAs);

  const tenant = useQuery({
    queryKey: ["tenant", actAs?.id ?? user.tenant?.id],
    queryFn: () => api<TenantRead>("/tenant"),
    enabled: hasTenant,
  });
  const jobs = useQuery({
    queryKey: ["jobs", "recent", actAs?.id],
    queryFn: () => api<CursorPage<JobRead>>("/jobs", { query: { limit: 5 } }),
  });

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.full_name.split(" ")[0]}`}
        description={hasTenant ? (tenant.data?.name ?? actAs?.name ?? user.tenant?.name) : "Platform administration"}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Your access</CardTitle>
            <CardDescription>What you can do in this workspace</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Roles: </span>
              {[...user.platform_roles, ...user.roles].map(humanize).join(", ") || "None"}
            </div>
            <div className="text-muted-foreground">{user.permissions.length} permissions granted</div>
            {hasTenant && tenant.data && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Organization status:</span>
                <StatusBadge status={tenant.data.status} />
              </div>
            )}
            {canManageUsers && hasTenant && (
              <Link href="/settings/users" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
                Manage users <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent background jobs</CardTitle>
            <CardDescription>Long-running work such as imports and AI discovery</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {jobs.isPending && <Skeleton className="h-16" />}
            {jobs.data?.items.length === 0 && <p className="text-muted-foreground">No jobs yet.</p>}
            {jobs.data?.items.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between gap-2 hover:underline">
                <span>{humanize(j.type)}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {timeAgo(j.created_at)} <StatusBadge status={j.status} />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming next</CardTitle>
            <CardDescription>The vendor intelligence features build on this foundation</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid list-disc gap-1.5 pl-4 text-sm text-muted-foreground">
              {NEXT_UP.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
