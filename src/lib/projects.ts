import type { VendorStage } from "@/lib/api/types";

export const PROJECT_STATUSES = ["active", "on_hold", "closed", "archived"] as const;

export const STAGES: { value: VendorStage; label: string }[] = [
  { value: "longlist", label: "Longlist" },
  { value: "shortlist", label: "Shortlist" },
  { value: "selected", label: "Selected" },
  { value: "rejected", label: "Rejected" },
];

export const MEMBER_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
] as const;
