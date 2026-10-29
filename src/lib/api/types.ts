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

// Phase 2: knowledge base, proposals, imports
export type VendorSummary = S["VendorSummary"];
export type VendorDetail = S["VendorDetail"];
export type VendorPage = S["VendorPage"];
export type TenantOverlayRead = S["TenantOverlayRead"];
export type TenantOverlayUpdate = S["TenantOverlayUpdate"];
export type AvlStatus = S["AvlStatus"];
export type EquipmentCategory = S["EquipmentCategoryRead"];
export type ServiceCategory = S["CategoryRead"];
export type CertificationType = S["CertificationTypeRead"];
export type Industry = S["IndustryRead"];
export type ProposalSummary = S["ProposalSummary"];
export type ProposalDetail = S["ProposalDetail"];
export type ProposalPage = S["ProposalPage"];
export type ProposalItemRead = S["ItemRead"];
export type ProposalStatus = S["ProposalStatus"];
export type UploadRead = S["UploadRead"];
export type SheetInfo = S["SheetInfo"];
export type ImportRequest = S["ImportRequest"];
export type ImportPreview = S["ImportPreview"];
export type ImportRowRead = S["ImportRowRead"];
export type ImportRowPage = S["ImportRowPage"];
export type ImportRowOutcome = S["ImportRowOutcome"];
export type PdfImportRequest = S["PdfImportRequest"];
export type PdfPreview = S["PdfPreview"];
export type PdfCandidate = S["PdfCandidate"];

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
