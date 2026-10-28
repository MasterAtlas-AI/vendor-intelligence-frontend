"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

import { LoadMore } from "@/components/load-more";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { AuditLogRead, CursorPage } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

/** Audit log browser. `path` is /audit-logs (own tenant) or /admin/audit-logs (whole platform). */
export function AuditLogTable({ path, showTenant = false }: { path: string; showTenant?: boolean }) {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const actionFilter = useDebounced(action.trim());

  const logs = useInfiniteQuery({
    queryKey: ["audit", path, actionFilter, from, to],
    queryFn: ({ pageParam, signal }) =>
      api<CursorPage<AuditLogRead>>(path, {
        query: {
          // "user." matches every user.* action; anything else matches exactly.
          action: actionFilter || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          limit: 50,
          cursor: pageParam,
        },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = logs.data?.pages.flatMap((p) => p.items) ?? [];
  const cols = showTenant ? 6 : 5;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input
          className="max-w-xs"
          placeholder='Action, e.g. "user." or "auth.login"'
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <Input type="date" className="w-40" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-40" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              {showTenant && <TableHead>Tenant</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isPending && (
              <TableRow>
                <TableCell colSpan={cols}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {!logs.isPending && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
                  No matching events.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const expanded = open === r.id;
              return (
                <Fragment key={r.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(expanded ? null : r.id)}>
                    <TableCell>{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.actor_type}
                      {r.actor_id ? ` · ${r.actor_id.slice(0, 8)}` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.entity_type ? `${r.entity_type} · ${r.entity_id?.slice(0, 8)}` : "—"}
                    </TableCell>
                    {showTenant && (
                      <TableCell className="text-xs text-muted-foreground">{r.tenant_id?.slice(0, 8) ?? "platform"}</TableCell>
                    )}
                  </TableRow>
                  {expanded && (
                    <TableRow>
                      <TableCell colSpan={cols} className="bg-muted/40">
                        <pre className="overflow-x-auto text-xs">
                          {JSON.stringify(
                            { changes: r.changes, metadata: r.metadata, ip: r.ip, request_id: r.request_id },
                            null,
                            2,
                          )}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <LoadMore hasNextPage={logs.hasNextPage} isFetchingNextPage={logs.isFetchingNextPage} fetchNextPage={logs.fetchNextPage} />
    </>
  );
}
