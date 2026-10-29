import type { JobRead } from "@/lib/api/types";
import { humanize } from "@/lib/format";

export const DISCOVERY_TYPES = ["vendor_discovery", "equipment_discovery", "service_discovery", "enrichment"] as const;

export const KIND_LABELS: Record<string, string> = {
  vendor_discovery: "Find vendors",
  equipment_discovery: "Equipment & certifications",
  service_discovery: "Services",
  enrichment: "Full refresh",
};

/** What a discovery job was asked to do, in a few words. */
export function jobTitle(job: JobRead): string {
  if (job.type !== "vendor_discovery") return String(job.input.vendor_name ?? "Vendor research");
  const req = (job.input.request ?? {}) as Record<string, unknown>;
  const brief = String(req.brief ?? "").trim();
  const codes = [...((req.equipment_categories as string[]) ?? []), ...((req.service_categories as string[]) ?? [])];
  return brief || codes.map((c) => humanize(c.split(".").pop() ?? c)).join(", ") || "Vendor discovery";
}
