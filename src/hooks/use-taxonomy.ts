import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { CertificationType, EquipmentCategory, Industry, ServiceCategory } from "@/lib/api/types";

// The taxonomy is small (a few hundred rows) and changes rarely: load each list once per session.
const STALE = 30 * 60_000;

export function useEquipmentCategories() {
  return useQuery({
    queryKey: ["taxonomy", "equipment"],
    queryFn: () => api<EquipmentCategory[]>("/taxonomy/equipment-categories"),
    staleTime: STALE,
  });
}

export function useServiceCategories() {
  return useQuery({
    queryKey: ["taxonomy", "services"],
    queryFn: () => api<ServiceCategory[]>("/taxonomy/service-categories"),
    staleTime: STALE,
  });
}

export function useCertificationTypes() {
  return useQuery({
    queryKey: ["taxonomy", "certifications"],
    queryFn: () => api<CertificationType[]>("/taxonomy/certification-types"),
    staleTime: STALE,
  });
}

export function useIndustries() {
  return useQuery({
    queryKey: ["taxonomy", "industries"],
    queryFn: () => api<Industry[]>("/taxonomy/industries"),
    staleTime: STALE,
  });
}

/** Select items for a tree taxonomy, indented by level so the hierarchy reads in a flat dropdown. */
export function treeItems(rows: { code: string; name: string; level: number }[] | undefined) {
  return (rows ?? []).map((r) => ({ value: r.code, label: `${"  ".repeat(r.level)}${r.name}` }));
}
