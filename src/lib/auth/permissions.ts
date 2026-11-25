import { useAuth } from "@/lib/auth/store";

// Mirrors app/domain/permissions.py in the backend. The API always enforces; this only shapes the UI.
export const P = {
  TENANT_MANAGE: "tenant:manage",
  TENANT_SETTINGS_MANAGE: "tenant_settings:manage",
  USER_READ: "user:read",
  USER_MANAGE: "user:manage",
  APIKEY_MANAGE: "apikey:manage",
  AUDIT_READ: "audit:read",
  VENDOR_READ: "vendor:read",
  SEARCH_RUN: "search:run",
  UPLOAD_CREATE: "upload:create",
  DISCOVERY_RUN: "discovery:run",
  KNOWLEDGE_APPROVE: "knowledge:approve",
  PROJECT_MANAGE: "project:manage",
  RFQ_MANAGE: "rfq:manage",
  REPORT_READ: "report:read",
  SCORECARD_MANAGE: "scorecard:manage",
  TENANT_VENDOR_APPROVE: "tenant_vendor:approve",
  TAXONOMY_MANAGE: "taxonomy:manage",
  ROLE_MANAGE: "role:manage",
  EQUIPMENT_READ: "equipment:read",
  EQUIPMENT_MANAGE: "equipment:manage",
  COMMERCIAL_READ: "commercial:read",
  DATA_EXPORT: "data:export",
} as const;

// Scopes an API key may carry (backend: API_KEY_ALLOWED_SCOPES).
export const API_KEY_SCOPES: { key: string; label: string }[] = [
  { key: "vendor:read", label: "Read vendors" },
  { key: "search:run", label: "Run searches" },
  { key: "report:read", label: "Read reports" },
  { key: "user:read", label: "Read users" },
  { key: "upload:create", label: "Upload files / run imports" },
  { key: "discovery:run", label: "Run AI discovery" },
  { key: "equipment:read", label: "Read project history (equipment, procurement, notes)" },
  { key: "equipment:manage", label: "Import MELs and edit project history" },
  { key: "commercial:read", label: "See commercial values (PO amounts)" },
  { key: "data:export", label: "Export data" },
  { key: "rfq:manage", label: "Create and manage RFQs" },
  { key: "project:manage", label: "Create and manage projects" },
  { key: "user:manage", label: "Invite, edit and disable users and assign roles" },
  { key: "role:manage", label: "Create and edit custom roles" },
  // Curators and super admins only (a key never carries more than its creator holds). Lets an integration such as
  // the Valvesheet portal review proposals and run the data-quality AI on the shared knowledge base.
  { key: "knowledge:approve", label: "Review proposals and run data-quality AI (curators)" },
];

export function useCan(permission: string): boolean {
  return useAuth((s) => s.user?.permissions.includes(permission) ?? false);
}

export function useIsSuperAdmin(): boolean {
  return useAuth((s) => s.user?.platform_roles.includes("super_admin") ?? false);
}
