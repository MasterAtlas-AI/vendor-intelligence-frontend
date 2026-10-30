"use client";

import { Upload } from "lucide-react";
import Link from "next/link";

import { NoAccess, PageHeader } from "@/components/page-header";
import { ReportButton } from "@/components/reports/report-button";
import { Button } from "@/components/ui/button";
import { VendorSearch } from "@/components/vendors/vendor-search";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";

export default function MyVendorsPage() {
  const canRead = useCan(P.VENDOR_READ);
  const canImport = useCan(P.UPLOAD_CREATE);
  const hasTenant = useAuth((s) => Boolean(s.user?.tenant || s.actAs));
  if (!canRead || !hasTenant) return <NoAccess what="an organization vendor list" />;
  return (
    <>
      <PageHeader
        title="My vendors"
        description="Your organization's vendor list: its own approval (AVL) status, vendor codes, tags and notes for vendors in the knowledge base."
        actions={
          <>
            <ReportButton reportType="avl" parameters={{}} label="Export" size="default" />
            {canImport && (
              <Button variant="outline" render={<Link href="/imports/new" />}>
                <Upload /> Import your vendor list
              </Button>
            )}
          </>
        }
      />
      <VendorSearch mine />
    </>
  );
}
