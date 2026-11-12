"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { errorMessage } from "@/lib/validation";

type Trends = components["schemas"]["Trends"];

const num = (x: number) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString() : Number(x.toPrecision(3)).toLocaleString());

/** SOW 23.6: how one equipment category changed across the organization's projects, by project year. */
export function TrendsPanel() {
  const [category, setCategory] = useState("");
  const data = useQuery({
    queryKey: ["equipment-trends", category],
    queryFn: () => api<Trends>("/equipment/trends", { query: { category_code: category || undefined } }),
    placeholderData: (previous) => previous,
  });
  const d = data.data;
  const years = d?.years.map((y) => y.year) ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Technology trends{d?.category_name ? `: ${d.category_name}` : ""}</CardTitle>
          <CardDescription>
            How this equipment changed across your projects, by project year: typical ratings, design choices, standards and makers. Each figure shows how many lines it rests on.
          </CardDescription>
        </div>
        {d && d.categories.length > 0 && (
          <FilterSelect
            label="Category"
            anyLabel="Most lines"
            value={category}
            onChange={setCategory}
            options={d.categories.map((c) => ({ value: c.code, label: `${c.name} (${c.lines})` }))}
            className="w-64 print:hidden"
          />
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {data.isPending && <Skeleton className="h-32" />}
        {data.isError && <p className="text-sm text-destructive">{errorMessage(data.error)}</p>}
        {d && d.categories.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No equipment on projects with a year yet. Give your historical projects their execution year to see trends.
          </p>
        )}
        {d && d.categories.length > 0 && years.length < 2 && (
          <p className="text-sm text-muted-foreground">
            {years.length === 1
              ? `All ${d.years[0].lines} lines of this category are from ${years[0]}; a trend needs projects from at least two years.`
              : "No lines of this category on projects with a year."}
            {d.undated_lines > 0 && ` ${d.undated_lines} more lines are on projects without a year.`}
          </p>
        )}
        {d && years.length >= 2 && (
          <>
            {d.highlights.length > 0 && (
              <ul className="grid gap-1 text-sm">
                {d.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    {/fell/.test(h) ? <TrendingDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <TrendingUp className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
                    {h}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {d.years.map((y) => `${y.year}: ${y.lines} line${y.lines === 1 ? "" : "s"} on ${y.projects} project${y.projects === 1 ? "" : "s"}`).join(" · ")}
              {d.undated_lines > 0 && ` · ${d.undated_lines} lines on projects without a year are left out`}
            </p>
            {d.numeric.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rating (median)</TableHead>
                      {years.map((y) => (
                        <TableHead key={y} className="text-right">
                          {y}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.numeric.map((t) => (
                      <TableRow key={t.key}>
                        <TableCell className="font-medium">
                          {t.label}
                          {t.unit && <span className="font-normal text-muted-foreground"> ({t.unit})</span>}
                        </TableCell>
                        {years.map((y) => {
                          const p = t.points.find((x) => x.year === y);
                          return (
                            <TableCell key={y} className="text-right tabular-nums" title={p ? `${num(p.low)} – ${num(p.high)}, ${p.lines} lines` : undefined}>
                              {p ? num(p.median) : <span className="text-muted-foreground">—</span>}
                              {p && <span className="ml-1 text-xs text-muted-foreground">({p.lines})</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right tabular-nums">
                          {t.change === null ? "—" : `${t.change > 0 ? "+" : ""}${Math.round(t.change * 100)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {d.shares.slice(0, 6).map((s) => (
                <div key={s.key} className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{s.label}</TableHead>
                        {years.map((y) => (
                          <TableHead key={y} className="text-right">
                            {y}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.rows.map((r) => (
                        <TableRow key={r.value}>
                          <TableCell className="max-w-48 truncate" title={r.value}>
                            {r.value}
                          </TableCell>
                          {years.map((y) => {
                            const share = r.by_year[String(y)];
                            return (
                              <TableCell key={y} className="text-right tabular-nums">
                                {share === undefined ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <span className={share >= 0.5 ? "font-medium" : share === 0 ? "text-muted-foreground" : undefined}>{Math.round(share * 100)}%</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
            {d.numeric.length === 0 && d.shares.length === 0 && (
              <p className="text-sm text-muted-foreground">These lines carry no ratings, materials, standards or makers to compare yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
