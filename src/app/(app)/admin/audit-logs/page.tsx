"use client";

import { AuditLogTable } from "@/components/audit-log-table";
import { NoAccess, PageHeader } from "@/components/page-header";
import { P, useCan } from "@/lib/auth/permissions";

export default function PlatformAuditLogPage() {
  const canRead = useCan(P.TENANT_MANAGE);
  if (!canRead) return <NoAccess what="the platform audit log" />;
  return (
    <>
      <PageHeader title="Platform audit log" description="Events across all tenants and platform staff." />
      <AuditLogTable path="/admin/audit-logs" showTenant />
    </>
  );
}
