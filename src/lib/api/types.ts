// Friendly aliases over the generated OpenAPI types (regenerate with `npm run api:types`).
import type { components } from "./schema";

type S = components["schemas"];

export type CurrentUser = S["CurrentUser"];
export type TokenResponse = S["TokenResponse"];
export type UserRead = S["UserRead"];
export type RoleRead = S["RoleRead"];
export type PermissionRead = S["PermissionRead"];
export type ApiKeyRead = S["ApiKeyRead"];
export type ApiKeyCreated = S["ApiKeyCreated"];
export type ApiKeyCreate = S["ApiKeyCreate"];
export type AuditLogRead = S["AuditLogRead"];
export type JobRead = S["JobRead"];
export type JobAccepted = S["JobAccepted"];
export type TenantRead = S["TenantRead"];
export type TenantAdminRead = S["TenantAdminRead"];
export type TenantCreate = S["TenantCreate"];
export type TenantAdminUpdate = S["TenantAdminUpdate"];
export type UserStatus = S["UserStatus"];
export type JobStatus = S["JobStatus"];
export type TenantStatus = S["TenantStatus"];

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
