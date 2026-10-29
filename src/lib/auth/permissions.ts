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
  TENANT_VENDOR_APPROVE: "tenant_vendor:approve",
} as const;

// Scopes an API key may carry (backend: API_KEY_ALLOWED_SCOPES).
export const API_KEY_SCOPES: { key: string; label: string }[] = [
  { key: "vendor:read", label: "Read vendors" },
  { key: "search:run", label: "Run searches" },
  { key: "report:read", label: "Read reports" },
  { key: "user:read", label: "Read users" },
  { key: "upload:create", label: "Upload files / run imports" },
  { key: "discovery:run", label: "Run AI discovery" },
];

export function useCan(permission: string): boolean {
  return useAuth((s) => s.user?.permissions.includes(permission) ?? false);
}

export function useIsSuperAdmin(): boolean {
  return useAuth((s) => s.user?.platform_roles.includes("super_admin") ?? false);
}
