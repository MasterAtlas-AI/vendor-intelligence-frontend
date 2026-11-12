"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerificationBadge } from "@/components/verification-badge";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { EquipmentPage } from "@/lib/api/types";
import { errorMessage } from "@/lib/validation";

import { attributeSummary, useAttributeIndex } from "./shared";

const PAGE = 50;

/** The project's recorded equipment lines (approved MEL rows and manual records). */
export function ProjectEquipment({ projectId }: { projectId: string }) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 300);
  const [offset, setOffset] = useState(0);
  const index = useAttributeIndex();
  const page = useQuery({
    queryKey: ["equipment", "project", projectId, term, offset],
    queryFn: ({ signal }) =>
      api<EquipmentPage>("/equipment/search", { method: "POST", body: { q: term, project_ids: [projectId], limit: PAGE, offset }, signal }),
    placeholderData: keepPreviousData,
  });
  const rows = page.data?.items ?? [];
  const total = page.data?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipment</CardTitle>
        <CardDescription>Equipment lines recorded for this project, from its approved MEL rows and manual records.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Input
          aria-label="Filter equipment"
          placeholder="Filter by tag, description, vendor…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
          className="max-w-sm"
        />
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Key attributes</TableHead>
                <TableHead>Verification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.isPending && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {page.isError && (
                <TableRow>
                  <TableCell colSpan={6} className="whitespace-normal text-destructive">
                    {errorMessage(page.error)}
                  </TableCell>
                </TableRow>
              )}
              {page.isSuccess && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center whitespace-normal text-muted-foreground">
                    {term ? "No equipment matches." : "No equipment recorded yet. Import the project's MEL to add its equipment lines."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/equipment/${e.id}`} className="hover:underline">
                      {e.tag || "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    <Link href={`/equipment/${e.id}`} className="font-medium hover:underline">
                      {e.name || "—"}
                    </Link>
                    {(e.service || e.quantity > 1) && (
                      <div className="text-xs text-muted-foreground">{[e.service, e.quantity > 1 && `× ${e.quantity}`].filter(Boolean).join(" · ")}</div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-40 text-sm whitespace-normal">{e.category_name ?? "—"}</TableCell>
                  <TableCell className="max-w-40 text-sm whitespace-normal">
                    {e.vendor_id ? (
                      <Link href={`/vendors/${e.vendor_id}`} className="hover:underline">
                        {e.vendor_name}
                      </Link>
                    ) : (
                      e.vendor_name || "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">{attributeSummary(e.attributes, index) || "—"}</TableCell>
                  <TableCell>
                    <VerificationBadge value={e.verification} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {total > PAGE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="tabular-nums">
              {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={offset === 0 || page.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={offset + PAGE >= total || page.isFetching} onClick={() => setOffset(offset + PAGE)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
