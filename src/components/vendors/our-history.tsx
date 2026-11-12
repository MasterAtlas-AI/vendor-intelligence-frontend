"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { VendorHistory } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { NOTE_KINDS } from "@/lib/history";
import { errorMessage } from "@/lib/validation";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function HistoryBody({ vendorId }: { vendorId: string }) {
  const history = useQuery({
    queryKey: ["vendor-history", vendorId],
    queryFn: () => api<VendorHistory>(`/vendors/${vendorId}/history`),
  });
  if (history.isPending) return <Skeleton className="h-20" />;
  if (history.isError) return <p className="text-sm text-destructive">{errorMessage(history.error)}</p>;
  const h = history.data;
  if (!h.projects.length && !h.equipment_count && !h.purchase_orders && !h.quotations && !h.notes.length)
    return <p className="text-sm text-muted-foreground">No record of this vendor in your projects yet.</p>;
  return (
    <div className="grid gap-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Projects" value={h.projects.length} />
        <Stat label="Equipment lines" value={h.equipment_count} />
        <Stat label="Purchase orders" value={h.purchase_orders} />
        <Stat label="Quotations" value={h.quotations} />
        <Stat
          label="Technically accepted"
          value={
            <>
              {h.technically_accepted}
              {h.technically_rejected > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({h.technically_rejected} not accepted)</span>}
            </>
          }
        />
        <Stat label="Avg lead time" value={h.avg_lead_time_weeks !== null ? `${h.avg_lead_time_weeks.toFixed(1)} wk` : "—"} />
        <Stat label="On time" value={h.on_time_rate !== null ? `${Math.round(h.on_time_rate * 100)}%` : "—"} />
        <Stat label="Avg rating" value={h.avg_rating !== null ? `${h.avg_rating.toFixed(1)} / 5` : "—"} />
      </div>
      {h.projects.length > 0 && (
        <ul className="grid gap-1">
          {h.projects.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-2">
              <Link href={`/projects/${p.id}`} className="truncate hover:underline">
                {p.name}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">{[p.year, p.location].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      {h.categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {h.categories.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
        </div>
      )}
      {h.notes.length > 0 && (
        <ul className="grid gap-2 border-t pt-3">
          {h.notes.slice(0, 5).map((n) => (
            <li key={n.id}>
              <div className="text-xs text-muted-foreground">
                {NOTE_KINDS.find(([k]) => k === n.kind)?.[1] ?? n.kind}
                {n.project_name && ` · ${n.project_name}`}
              </div>
              <div className="font-medium">{n.title}</div>
              {n.body && <p className="line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the organization's own executed projects say about this vendor: projects, POs, delivery and lessons. */
export function OurHistory({ vendorId }: { vendorId: string }) {
  const canRead = useCan(P.EQUIPMENT_READ);
  if (!canRead) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Our history</CardTitle>
        <CardDescription>From your organization&apos;s executed projects.</CardDescription>
      </CardHeader>
      <CardContent>
        <HistoryBody vendorId={vendorId} />
      </CardContent>
    </Card>
  );
}
