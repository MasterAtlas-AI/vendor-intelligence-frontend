"use client";

import Link from "next/link";

import { BarList, StatTile } from "@/components/analytics/bar-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HistoryAnalytics } from "@/lib/api/types";

export type HistoryPanel = "totals" | "categories" | "vendors" | "years" | "long_lead" | "performance";

/** The organization's own project history (SOW 23): equipment across projects, most-used vendors, long-lead items,
 *  vendor performance, technology trend by year. `panels` picks which ones (a department view shows a subset). */
export function HistoryPanels({ h, panels }: { h: HistoryAnalytics; panels?: HistoryPanel[] }) {
  const show = (p: HistoryPanel) => !panels || panels.includes(p);
  if (!h.equipment && !h.purchase_orders && !h.awaiting_review) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          No project history yet. Mark an executed project as historical and import its MEL from the project page; equipment, vendors and
          lead times then show here.{" "}
          <Link href="/projects" className="text-primary hover:underline">
            Go to projects
          </Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4">
      {show("totals") && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile label="Equipment lines" value={h.equipment.toLocaleString()} hint={`${h.added_recently} added in the period`} />
          <StatTile label="Historical projects" value={h.historical_projects.toLocaleString()} />
          <StatTile label="Purchase orders" value={h.purchase_orders.toLocaleString()} />
          <StatTile label="Lessons and feedback" value={h.notes.toLocaleString()} />
          <StatTile label="MEL rows awaiting review" value={h.awaiting_review.toLocaleString()} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {show("categories") && (
          <BarList title="Equipment by category" description="Lines in your projects, by top-level category." items={h.equipment_by_category} />
        )}
        {show("vendors") && (
          <BarList title="Most-used vendors" description="Number of your projects each vendor supplied." items={h.most_used_vendors} />
        )}
        {show("years") && (
          <BarList
            title="Equipment by project year"
            description="Volume and technology trend across your projects."
            items={h.equipment_by_year}
            max={20}
            empty="No project years recorded yet."
          />
        )}
        {show("long_lead") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Long-lead items</CardTitle>
              <CardDescription>Longest PO-to-delivery lead times on record.</CardDescription>
            </CardHeader>
            <CardContent>
              {h.long_lead.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {h.long_lead.map((r, i) => (
                      <tr key={i} className="border-t first:border-t-0">
                        <td className="py-1.5 pr-2">
                          <div className="font-medium">{r.category}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.vendor || "Unknown vendor"} · {r.project}
                          </div>
                        </td>
                        <td className="py-1.5 text-right font-medium whitespace-nowrap tabular-nums">{r.weeks} wks</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">No lead times recorded yet.</p>
              )}
            </CardContent>
          </Card>
        )}
        {show("performance") && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Vendor performance</CardTitle>
              <CardDescription>From your purchase orders: average lead time, on-time delivery and rating (1-5).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {h.vendor_performance.length ? (
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1.5">Vendor</th>
                      <th className="py-1.5 text-right">Orders</th>
                      <th className="py-1.5 text-right">Avg lead time</th>
                      <th className="py-1.5 text-right">On time</th>
                      <th className="py-1.5 text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.vendor_performance.map((v) => (
                      <tr key={v.vendor} className="border-t">
                        <td className="py-1.5 font-medium">{v.vendor}</td>
                        <td className="py-1.5 text-right tabular-nums">{v.orders}</td>
                        <td className="py-1.5 text-right tabular-nums">{v.avg_lead_weeks !== null ? `${v.avg_lead_weeks} wks` : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{v.on_time_rate !== null ? `${Math.round(v.on_time_rate * 100)}%` : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{v.avg_rating !== null ? `${v.avg_rating} / 5` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">No purchase orders recorded yet.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
