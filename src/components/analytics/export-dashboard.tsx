"use client";

import { Download, Printer } from "lucide-react";

import { downloadText } from "@/components/equipment/shared";
import { Button } from "@/components/ui/button";

type Value = string | number | boolean | null | undefined | Value[] | { [key: string]: Value };

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every figure on a dashboard as "section, item, value" rows: numbers, bar lists ({label, value}) and tables of
 *  records (each record's fields joined), nested sections prefixed. */
export function dashboardRows(data: Record<string, Value>, prefix = ""): string[][] {
  const rows: string[][] = [];
  const name = (k: string) => (prefix ? `${prefix} / ` : "") + k.replace(/_/g, " ");
  for (const [key, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const o = item as Record<string, Value>;
          if ("label" in o && "value" in o) rows.push([name(key), String(o.label), String(o.value)]);
          else {
            const entries = Object.entries(o).filter(([, x]) => x !== null && typeof x !== "object");
            rows.push([name(key), String(entries[0]?.[1] ?? ""), entries.slice(1).map(([k, x]) => `${k.replace(/_/g, " ")}: ${x}`).join("; ")]);
          }
        } else rows.push([name(key), "", String(item)]);
      }
    } else if (typeof v === "object") rows.push(...dashboardRows(v as Record<string, Value>, name(key)));
    else rows.push(["Summary", name(key), String(v)]);
  }
  return rows;
}

/** SOW 23.9: take a dashboard away as CSV (every figure on it) or as a PDF (the browser's print, sidebar hidden). */
export function ExportDashboard({ name, data }: { name: string; data: Record<string, unknown> | undefined }) {
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex gap-2 print:hidden">
      <Button
        variant="outline"
        size="sm"
        disabled={!data}
        onClick={() => {
          const rows = [["Section", "Item", "Value"], ...dashboardRows((data ?? {}) as Record<string, Value>)];
          downloadText(`${name}-${stamp}.csv`, rows.map((r) => r.map(cell).join(",")).join("\n"));
        }}
      >
        <Download /> Export CSV
      </Button>
      <Button variant="outline" size="sm" disabled={!data} onClick={() => window.print()} title="Opens the print dialog: choose Save as PDF">
        <Printer /> Print / PDF
      </Button>
    </div>
  );
}
