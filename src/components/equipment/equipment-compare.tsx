"use client";

import { Download } from "lucide-react";
import Link from "next/link";

import { downloadText, projectLabel } from "@/components/equipment/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerificationBadge } from "@/components/verification-badge";
import type { Equipment, EquipmentAttribute } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { humanize } from "@/lib/format";
import { VERIFICATION, formatAttribute } from "@/lib/history";

export const COMPARE_MAX = 6;

/** One comparison row: a display node and a plain-text value per equipment column. */
interface Row {
  key: string;
  label: string;
  cells: { node: React.ReactNode; text: string }[];
  /** Index of the lowest / highest numeric value, for attribute rows with a spread. */
  low?: number;
  high?: number;
}

/** Lower and upper bound of a numeric attribute value (a number or a [min, max] range); null otherwise. */
function bounds(value: unknown): [number, number] | null {
  if (typeof value === "number" && Number.isFinite(value)) return [value, value];
  if (Array.isArray(value) && value.length === 2 && value.every((x) => typeof x === "number" && Number.isFinite(x))) return [value[0] as number, value[1] as number];
  return null;
}

function title(e: Equipment): string {
  return e.name || e.tag || "Untitled";
}

function buildRows(items: Equipment[], index: Record<string, EquipmentAttribute>): Row[] {
  const plain = (text: string) => ({ node: text || "—", text });
  const project = (e: Equipment) => [projectLabel(e.project), e.project.location ? humanize(e.project.location) : ""].filter(Boolean).join(" · ");
  const rows: Row[] = [
    {
      key: "project",
      label: "Project",
      cells: items.map((e) => ({
        node: (
          <>
            {projectLabel(e.project)}
            {e.project.location && <div className="text-xs text-muted-foreground">{humanize(e.project.location)}</div>}
          </>
        ),
        text: project(e),
      })),
    },
    { key: "category", label: "Category", cells: items.map((e) => plain(e.category_name ?? e.category_code ?? "")) },
    { key: "vendor", label: "Vendor", cells: items.map((e) => plain(e.vendor_name)) },
    { key: "manufacturer", label: "Manufacturer", cells: items.map((e) => plain(e.manufacturer_name)) },
    { key: "model", label: "Model", cells: items.map((e) => plain(e.model)) },
    { key: "tag", label: "Tag", cells: items.map((e) => plain(e.tag)) },
    { key: "quantity", label: "Quantity", cells: items.map((e) => plain(e.quantity.toLocaleString())) },
  ];

  const keys = [...new Set(items.flatMap((e) => Object.keys(e.attributes ?? {})))].sort(
    (a, b) => (index[a]?.sort_order ?? 999) - (index[b]?.sort_order ?? 999) || a.localeCompare(b),
  );
  for (const key of keys) {
    const def = index[key];
    const values = items.map((e) => e.attributes?.[key]);
    const cells = values.map((v) => {
      const text = formatAttribute(v, def?.unit);
      return text === "—" ? plain("") : plain(text);
    });
    const numeric = values.map(bounds);
    const present = numeric.filter((b): b is [number, number] => b !== null);
    let low: number | undefined;
    let high: number | undefined;
    if (present.length >= 2) {
      const min = Math.min(...present.map((b) => b[0]));
      const max = Math.max(...present.map((b) => b[1]));
      if (min < max) {
        low = numeric.findIndex((b) => b !== null && b[0] === min);
        high = numeric.findIndex((b) => b !== null && b[1] === max);
      }
    }
    rows.push({ key: `attr:${key}`, label: def ? (def.unit ? `${def.label} (${def.unit})` : def.label) : key, cells, low, high });
  }

  rows.push(
    {
      key: "standards",
      label: "Standards",
      cells: items.map((e) => ({
        node:
          e.standards.length === 0 ? (
            "—"
          ) : (
            <div className="flex flex-wrap gap-1">
              {e.standards.map((s) => (
                <Badge key={s} variant="outline">
                  {s}
                </Badge>
              ))}
            </div>
          ),
        text: e.standards.join("; "),
      })),
    },
    {
      key: "verification",
      label: "Verification",
      cells: items.map((e) => ({ node: <VerificationBadge value={e.verification} />, text: VERIFICATION[e.verification]?.label ?? e.verification })),
    },
  );
  // Rows empty for every selected record add nothing to a comparison.
  return rows.filter((r) => r.cells.some((c) => c.text.trim() !== ""));
}

function compareCsv(items: Equipment[], rows: Row[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [["", ...items.map(title)], ...rows.map((r) => [r.label, ...r.cells.map((c) => c.text)])].map((line) => line.map(cell).join(",")).join("\n");
}

/** Side-by-side comparison of selected equipment lines (SOW 11): records as columns, data points as rows. */
export function EquipmentCompare({
  open,
  onOpenChange,
  items,
  index,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: Equipment[];
  index: Record<string, EquipmentAttribute>;
}) {
  const canExport = useCan(P.DATA_EXPORT);
  const rows = buildRows(items, index);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] grid-rows-[auto_1fr] sm:max-w-6xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle>Compare equipment</DialogTitle>
            {canExport && (
              <Button variant="outline" size="sm" disabled={items.length === 0} onClick={() => downloadText("equipment-comparison.csv", compareCsv(items, rows))}>
                <Download /> Export CSV
              </Button>
            )}
          </div>
          <DialogDescription>
            {items.length} record{items.length === 1 ? "" : "s"} side by side. Bold marks the lowest and highest value of each technical attribute.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-popover" />
                {items.map((e) => (
                  <TableHead key={e.id} className="min-w-44 align-top whitespace-normal">
                    <Link href={`/equipment/${e.id}`} className="font-medium hover:underline">
                      {title(e)}
                    </Link>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="sticky left-0 z-10 bg-popover align-top text-muted-foreground">{r.label}</TableCell>
                  {r.cells.map((c, i) => {
                    const isLow = i === r.low;
                    const isHigh = i === r.high;
                    const mark = isLow && isHigh ? "Lowest and highest" : isLow ? "Lowest" : isHigh ? "Highest" : "";
                    return (
                      <TableCell key={i} className={`align-top text-sm whitespace-normal ${r.key.startsWith("attr:") ? "tabular-nums" : ""} ${mark ? "font-semibold" : ""}`} title={mark || undefined}>
                        {c.node}
                        {mark && <span className="ml-1 text-xs font-normal text-muted-foreground">{isLow && isHigh ? "↕" : isLow ? "↓" : "↑"}</span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
