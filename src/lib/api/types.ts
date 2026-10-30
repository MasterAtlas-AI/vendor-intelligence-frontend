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

// Phase 3: AI discovery
export type DiscoveryRequest = S["DiscoveryRequest"];
export type DiscoveryEstimate = S["DiscoveryEstimate"];
export type DiscoveryAccepted = S["DiscoveryAccepted"];
export type CapabilityRequest = S["CapabilityRequest"];
export type AiUsage = S["AiUsageRead"];
export type DedupScanRequest = S["DedupScanRequest"];
export type Region = NonNullable<DiscoveryRequest["regions"]>[number];

// Phase 4: search
export type SearchIntent = S["SearchIntent"];
export type SearchRequest = S["SearchRequest"];
export type SearchResponse = S["SearchResponse"];
export type SearchHit = S["SearchHit"];
export type MatchReason = S["MatchReason"];
export type SearchHistoryEntry = S["SearchHistoryRead"];
export type Suggestion = S["Suggestion"];

// Phase 4: projects and scorecards
export type ProjectRead = S["TenantProjectRead"];
export type ProjectMember = S["MemberRead"];
export type ProjectVendor = S["ProjectVendorRead"];
export type ScorecardTemplate = S["TemplateRead"];
export type Scorecard = S["ScorecardRead"];
export type VendorStage = ProjectVendor["stage"];

// Phase 4: assistant
export type ChatMessage = S["ChatMessage"];
export type ChatResponse = S["ChatResponse"];
export type CitedVendor = S["CitedVendor"];
export type ChatAction = S["ChatAction"];

// Phase 5: RFQs
export type Rfq = S["RfqRead"];
export type RfqVendor = S["RfqVendorRead"];

// Phase 5: reports
export type ReportRead = S["ReportRead"];
export type ReportRequest = S["ReportRequest"];

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
