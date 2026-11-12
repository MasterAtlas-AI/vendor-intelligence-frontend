"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { CategoryNode, Equipment, EquipmentAttribute, ProjectRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { VERIFICATION, departmentLabel, formatAttribute } from "@/lib/history";
import { countryName } from "@/lib/vendors";

/** Attribute definitions (labels, units, number/text) shared by search filters, near-fit and the profile. */
export function useAttributeDefs(enabled = true) {
  return useQuery({
    queryKey: ["equipment-attributes"],
    queryFn: () => api<EquipmentAttribute[]>("/equipment-attributes"),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** The category tree, flattened with indentation for a dropdown (needs vendor:read on the API). */
export function useCategoryOptions() {
  const canBrowse = useCan(P.VENDOR_READ);
  const tree = useQuery({
    queryKey: ["categories", "browse"],
    queryFn: () => api<CategoryNode[]>("/categories/browse"),
    staleTime: 5 * 60_000,
    enabled: canBrowse,
  });
  const options: { value: string; label: string }[] = [];
  const walk = (nodes: CategoryNode[], depth: number) => {
    for (const n of nodes) {
      options.push({ value: n.code, label: `${"  ".repeat(depth)}${n.name}` });
      if (n.children?.length) walk(n.children, depth + 1);
    }
  };
  walk(tree.data ?? [], 0);
  return { options, available: canBrowse };
}

/** The organization's projects (for the project, country and facility filters). */
export function useProjects(enabled = true) {
  const actAs = useAuth((s) => s.actAs);
  return useQuery({
    queryKey: ["projects", actAs?.id, ""],
    queryFn: () => api<ProjectRead[]>("/projects"),
    enabled,
  });
}

/** Numeric attribute definitions that apply to a category (shared ones, or those of the category or a parent). */
export function defsForCategory(defs: EquipmentAttribute[], category: string, type?: "number" | "text"): EquipmentAttribute[] {
  return defs
    .filter((d) => !type || d.data_type === type)
    .filter((d) => !category || d.shared || !d.category_code || category === d.category_code || category.startsWith(`${d.category_code}.`))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function attributeLabel(def: EquipmentAttribute | undefined, key: string): string {
  if (!def) return key;
  return def.unit ? `${def.label} (${def.unit})` : def.label;
}

/** A few attribute values for a compact table cell. */
export function attributeSummary(e: Equipment, index: Record<string, EquipmentAttribute>, max = 3): string {
  return Object.entries(e.attributes ?? {})
    .slice(0, max)
    .map(([k, v]) => `${index[k]?.label ?? k}: ${formatAttribute(v, index[k]?.unit)}`)
    .join(" · ");
}

export function projectLabel(p: { name: string; year?: number | null } | null | undefined): string {
  if (!p) return "—";
  return p.year ? `${p.name} (${p.year})` : p.name;
}

/** CSV of equipment records, one column per attribute found in the rows. */
export function equipmentCsv(rows: Equipment[], index: Record<string, EquipmentAttribute>): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.attributes ?? {})))];
  const head = [
    "Tag",
    "Name",
    "Category",
    "Project",
    "Project year",
    "Project country",
    "Vendor",
    "Manufacturer",
    "Model",
    "Service",
    "Quantity",
    "Standards",
    ...keys.map((k) => attributeLabel(index[k], k)),
    "Department",
    "Verification",
    "Source",
  ];
  const plain = (v: unknown) => (Array.isArray(v) ? v.join(" - ") : v);
  return [
    head.map(cell).join(","),
    ...rows.map((r) =>
      [
        r.tag,
        r.name,
        r.category_name ?? r.category_code ?? "",
        r.project.name,
        r.project.year ?? "",
        countryName(r.project.country),
        r.vendor_name,
        r.manufacturer_name,
        r.model,
        r.service,
        r.quantity,
        r.standards.join("; "),
        ...keys.map((k) => plain(r.attributes?.[k])),
        r.department ? departmentLabel(r.department) : "",
        VERIFICATION[r.verification]?.label ?? r.verification,
        r.source_ref,
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\n");
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/** Parses "1200", "20-1200" or "20 – 1200" into a number or a [min, max] pair; null when not numeric. */
export function parseNumeric(text: string): number | number[] | null {
  const t = text.trim().replace(/,/g, "");
  if (!t) return null;
  const range = t.match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
  if (range) return [Number(range[1]), Number(range[2])];
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The inverse of parseNumeric, for an edit box. */
export function attributeText(value: unknown): string {
  if (Array.isArray(value)) return value.join(" - ");
  if (value === null || value === undefined) return "";
  return String(value);
}
