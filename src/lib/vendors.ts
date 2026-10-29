import type { AvlStatus, ImportRowOutcome } from "@/lib/api/types";

export const AVL_LABELS: Record<AvlStatus, string> = {
  approved: "Approved",
  conditional: "Conditional",
  not_approved: "Not approved",
  blacklisted: "Blacklisted",
  unassessed: "Not assessed",
};

export const AVL_OPTIONS = Object.entries(AVL_LABELS).map(([value, label]) => ({ value, label }));

export const OUTCOME_LABELS: Record<ImportRowOutcome, string> = {
  matched: "Matched existing vendor",
  created: "New vendor added",
  proposed: "Sent for review",
  already_proposed: "Already under review",
  duplicate_in_file: "Duplicate in file",
  ambiguous: "Ambiguous name",
  invalid: "Invalid row",
  discarded: "Discarded",
};

export function countryName(code: string | null | undefined): string {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Manual entry",
  excel: "Excel",
  pdf: "PDF",
  ai_vendor_discovery: "AI vendor discovery",
  ai_equipment_discovery: "AI equipment discovery",
  suggestion: "Suggestion",
  dedup_scan: "Duplicate scan",
};

export function originLabel(origin: string): string {
  return ORIGIN_LABELS[origin] ?? origin;
}
