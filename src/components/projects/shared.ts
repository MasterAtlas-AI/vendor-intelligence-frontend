"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { CategoryNode, EquipmentAttribute, ProjectRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { attributeIndex, formatAttribute } from "@/lib/history";

export const PROJECT_KINDS: { value: ProjectRead["kind"]; label: string; hint: string }[] = [
  { value: "sourcing", label: "Sourcing", hint: "A live package or bid you're shortlisting vendors for" },
  { value: "historical", label: "Executed (history)", hint: "A finished project: its MEL, POs and lessons become organization knowledge" },
];

export const PROJECT_LOCATIONS = [
  { value: "offshore", label: "Offshore" },
  { value: "onshore", label: "Onshore" },
] as const;

export function kindLabel(kind: string | null | undefined): string {
  return PROJECT_KINDS.find((k) => k.value === kind)?.label ?? "—";
}

/** Attribute definitions (labels and units), cached under the same key as the equipment pages. */
export function useAttributeIndex() {
  const canRead = useCan(P.EQUIPMENT_READ);
  const defs = useQuery({
    queryKey: ["equipment-attributes"],
    queryFn: () => api<EquipmentAttribute[]>("/equipment-attributes"),
    staleTime: 5 * 60_000,
    enabled: canRead,
  });
  return attributeIndex(defs.data);
}

/** The category tree flattened with indentation, for a dropdown. */
export function useCategoryOptions(enabled = true) {
  const canBrowse = useCan(P.VENDOR_READ);
  const tree = useQuery({
    queryKey: ["categories", "browse"],
    queryFn: () => api<CategoryNode[]>("/categories/browse"),
    staleTime: 5 * 60_000,
    enabled: enabled && canBrowse,
  });
  const options: { value: string; label: string }[] = [];
  const walk = (nodes: CategoryNode[], depth: number) => {
    for (const n of nodes) {
      options.push({ value: n.code, label: `${"  ".repeat(depth)}${n.name}` });
      if (n.children?.length) walk(n.children, depth + 1);
    }
  };
  walk(tree.data ?? [], 0);
  return { options, available: canBrowse, isPending: tree.isPending && canBrowse };
}

/** "Flow: 1,200 m3/h · Head: 20 – 80 m" for a compact cell. */
export function attributeSummary(
  attributes: Record<string, unknown> | null | undefined,
  index: Record<string, EquipmentAttribute>,
  max = 3,
): string {
  return Object.entries(attributes ?? {})
    .slice(0, max)
    .map(([k, v]) => `${index[k]?.label ?? k}: ${formatAttribute(v, index[k]?.unit)}`)
    .join(" · ");
}

/** "2024-05-01" for a date input, from a date or datetime string. */
export function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}
