// Labels for the organization's own project history (SOW 14, 19). Mirrors app/modules/equipment/models.py.
import type { EquipmentAttribute, Verification } from "@/lib/api/types";

export const VERIFICATION: Record<Verification, { label: string; tone: string; hint: string }> = {
  verified: { label: "Verified SPE data", tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300", hint: "Checked by an authorized user" },
  historical: { label: "Historical project data", tone: "bg-sky-500/15 text-sky-800 dark:text-sky-300", hint: "From an executed project's MEL or records" },
  vendor_provided: { label: "Vendor-provided", tone: "bg-violet-500/15 text-violet-800 dark:text-violet-300", hint: "From vendor datasheets or quotations" },
  public: { label: "Public-domain", tone: "bg-slate-500/15 text-slate-800 dark:text-slate-300", hint: "From public sources" },
  ai_extracted: { label: "AI-extracted, pending verification", tone: "bg-amber-500/15 text-amber-800 dark:text-amber-300", hint: "Read automatically; not yet checked" },
  user_entered: { label: "User-entered, pending verification", tone: "bg-amber-500/15 text-amber-800 dark:text-amber-300", hint: "Entered by a user; not yet checked" },
  archived: { label: "Archived / superseded", tone: "bg-muted text-muted-foreground", hint: "Kept for traceability only" },
};

export const DEPARTMENTS = [
  ["engineering", "Engineering"],
  ["procurement", "Procurement"],
  ["planning", "Planning"],
  ["project_management", "Project management"],
  ["operations", "Operations"],
  ["construction", "Construction"],
  ["commissioning", "Commissioning"],
  ["qa_qc", "Quality / QA-QC"],
  ["hse", "HSE"],
  ["supply_chain", "Supply chain"],
  ["management", "Management"],
  ["business_development", "Business development"],
  ["marketing", "Marketing"],
  ["document_control", "Document control (DCC)"],
] as const;

export type Department = (typeof DEPARTMENTS)[number][0];

export function departmentLabel(value: string | null | undefined): string {
  return DEPARTMENTS.find(([k]) => k === value)?.[1] ?? "—";
}

export const NOTE_KINDS = [
  ["lesson_learned", "Lesson learned"],
  ["operating_feedback", "Operating feedback"],
  ["maintenance", "Maintenance"],
  ["spares", "Spares"],
  ["performance", "Performance"],
  ["inspection", "Inspection / QA-QC"],
  ["project_update", "Project update"],
  ["other", "Other"],
] as const;

/** Where an equipment line stands (project management). */
export const EQUIPMENT_STATUSES = [
  ["planned", "Planned"],
  ["ordered", "Ordered"],
  ["delivered", "Delivered"],
  ["installed", "Installed"],
  ["in_service", "In service"],
  ["standby", "Standby"],
  ["decommissioned", "Decommissioned"],
] as const;

export function equipmentStatusLabel(value: string | null | undefined): string {
  return EQUIPMENT_STATUSES.find(([k]) => k === value)?.[1] ?? "—";
}

/** A stored attribute value for display: 1200 -> "1,200 m3/h", [20, 1200] -> "20 – 1,200 m3/h", text as is. */
export function formatAttribute(value: unknown, unit = ""): string {
  const n = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const u = unit ? ` ${unit}` : "";
  if (typeof value === "number") return `${n(value)}${u}`;
  if (Array.isArray(value) && value.length === 2 && value.every((x) => typeof x === "number")) {
    const [lo, hi] = value as number[];
    return lo === hi ? `${n(lo)}${u}` : `${n(lo)} – ${n(hi)}${u}`;
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Attribute definitions by key, for labels and units. */
export function attributeIndex(defs: EquipmentAttribute[] | undefined): Record<string, EquipmentAttribute> {
  return Object.fromEntries((defs ?? []).map((d) => [d.key, d]));
}
