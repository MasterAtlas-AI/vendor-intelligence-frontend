"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface BarItem {
  label: string;
  value: number;
}

/** Horizontal bars for "how many per category": one hue, value in text ink beside each bar, tooltip on hover.
 *  Bars are scaled to the largest value; labels stay readable without the bar (identity is never color-alone). */
export function BarList({
  title,
  description,
  items,
  format = (n) => n.toLocaleString(),
  labelFor = (s) => s,
  empty = "No data yet.",
  max: maxItems = 12,
}: {
  title: string;
  description?: string;
  items: BarItem[];
  format?: (n: number) => string;
  labelFor?: (label: string) => string;
  empty?: string;
  max?: number;
}) {
  const shown = items.slice(0, maxItems);
  const rest = items.slice(maxItems).reduce((a, b) => a + b.value, 0);
  const rows = rest > 0 ? [...shown, { label: "Other", value: rest }] : shown;
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-2" aria-label={title}>
            {rows.map((r) => {
              const label = r.label === "Other" ? "Other" : labelFor(r.label);
              return (
                <li key={r.label} className="group grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 text-sm" title={`${label}: ${format(r.value)}`}>
                  <span className="truncate text-muted-foreground group-hover:text-foreground">{label}</span>
                  <span className="h-2.5 rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-primary/80 transition-colors group-hover:bg-primary"
                      style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">{format(r.value)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** A headline number with a label (no chart needed). */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
