"use client";

import { AuditLogTable } from "@/components/audit-log-table";
import { NoAccess, PageHeader } from "@/components/page-header";
import { P, useCan } from "@/lib/auth/permissions";

export default function AuditLogPage() {
  const canRead = useCan(P.AUDIT_READ);
  if (!canRead) return <NoAccess what="the audit log" />;
  return (
    <>
      <PageHeader title="Audit log" description="Every sign-in and change in your organization. Click a row for details." />
      <AuditLogTable path="/audit-logs" />
    </>
  );
}
