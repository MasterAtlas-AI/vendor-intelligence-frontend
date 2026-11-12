"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { errorMessage } from "@/lib/validation";

type Benchmarks = components["schemas"]["Benchmarks"];

const money = (value: string | number, currency: string) => {
  try {
    return Number(value).toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    return `${Number(value).toLocaleString()} ${currency}`;
  }
};

/** SOW 29.5: lead-time ranges and unit prices from the organization's own procurement records. */
export function BenchmarksPanel() {
  const [groupBy, setGroupBy] = useState("");
  const data = useQuery({
    queryKey: ["benchmarks", groupBy || "category"],
    queryFn: () => api<Benchmarks>("/equipment/benchmarks", { query: { group_by: groupBy || "category" } }),
  });
  const d = data.data;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Lead-time and cost benchmarks</CardTitle>
          <CardDescription>
            From your procurement records (POs, quotations, requisitions): the lead time to expect and what a unit cost. Statistics, not promises; each row shows how many records it rests on.
          </CardDescription>
        </div>
        <FilterSelect
          label="Group by"
          anyLabel="By category"
          value={groupBy}
          onChange={setGroupBy}
          options={[{ value: "vendor", label: "By vendor" }]}
          className="w-40 print:hidden"
        />
      </CardHeader>
      <CardContent>
        {data.isPending && <Skeleton className="h-24" />}
        {data.isError && <p className="text-sm text-destructive">{errorMessage(data.error)}</p>}
        {d && d.rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No procurement records yet. Add POs or quotations on a project&apos;s Procurement tab, or import them with a MEL.</p>
        )}
        {d && d.rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.group_by === "vendor" ? "Vendor" : "Category"}</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Lead time</TableHead>
                  <TableHead className="text-right">On time</TableHead>
                  <TableHead>Price per unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.rows.map((b) => (
                  <TableRow key={b.key}>
                    <TableCell className="font-medium">{b.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.records}</TableCell>
                    <TableCell className="text-sm whitespace-normal">{b.expected}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.on_time_rate === null ? "—" : `${Math.round(b.on_time_rate * 100)}%`}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {d.commercial_hidden
                        ? "Hidden (commercial data)"
                        : b.prices.length === 0
                          ? "—"
                          : b.prices.map((p) => (
                              <div key={p.currency}>
                                {money(p.median, p.currency)} median
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  ({money(p.low, p.currency)}–{money(p.high, p.currency)}, {p.records})
                                </span>
                              </div>
                            ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
