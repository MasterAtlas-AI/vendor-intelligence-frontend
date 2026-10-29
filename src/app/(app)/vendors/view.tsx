"use client";

import { Upload } from "lucide-react";
import Link from "next/link";

import { NoAccess, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { VendorSearch } from "@/components/vendors/vendor-search";
import { P, useCan } from "@/lib/auth/permissions";

export default function VendorsPage() {
  const canRead = useCan(P.VENDOR_READ);
  const canImport = useCan(P.UPLOAD_CREATE);
  if (!canRead) return <NoAccess what="the vendor knowledge base" />;
  return (
    <>
      <PageHeader
        title="Vendors"
        description="The global vendor knowledge base, curated and shared by every organization. Your own approval status and notes stay private."
        actions={
          canImport && (
            <Button variant="outline" render={<Link href="/imports/new" />}>
              <Upload /> Import vendors
            </Button>
          )
        }
      />
      <VendorSearch />
    </>
  );
}
