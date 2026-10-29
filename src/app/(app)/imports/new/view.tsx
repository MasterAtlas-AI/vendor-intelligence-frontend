"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PdfStep } from "@/components/imports/pdf-step";
import { SpreadsheetStep } from "@/components/imports/spreadsheet-step";
import { UploadStep } from "@/components/imports/upload-step";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { UploadRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";

export default function NewImportPage() {
  const canImport = useCan(P.UPLOAD_CREATE);
  const [upload, setUpload] = useState<UploadRead | null>(null);
  if (!canImport) return <NoAccess what="imports" />;

  return (
    <>
      <Link href="/imports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> Imports
      </Link>
      <PageHeader
        title="New import"
        description={
          !upload
            ? "Step 1 of 2: upload a file."
            : upload.kind === "pdf"
              ? "Step 2 of 2: say whose document this is and check what was found."
              : "Step 2 of 2: check which columns hold what, then import."
        }
        actions={
          upload && (
            <Button variant="outline" onClick={() => setUpload(null)}>
              Use a different file
            </Button>
          )
        }
      />
      {!upload && <UploadStep onUploaded={setUpload} />}
      {/* Next keeps visited routes' state, so clear the wizard once an import starts. */}
      {upload?.kind === "spreadsheet" && <SpreadsheetStep upload={upload} onStarted={() => setUpload(null)} />}
      {upload?.kind === "pdf" && <PdfStep upload={upload} onStarted={() => setUpload(null)} />}
    </>
  );
}
