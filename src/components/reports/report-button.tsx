"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, download } from "@/lib/api/client";
import type { ReportRead, ReportRequest } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

const POLL_MS = 2000;
const MAX_WAIT_MS = 5 * 60_000;

/** Requests a report, waits for the background job, then downloads the file. Resolves to the finished report. */
export async function generateReport(body: ReportRequest): Promise<ReportRead> {
  let report = await api<ReportRead>("/reports", { method: "POST", body });
  const started = Date.now();
  while (report.status === "queued") {
    if (Date.now() - started > MAX_WAIT_MS) throw new Error("The report is taking long; it will appear under Reports when ready");
    await new Promise((r) => setTimeout(r, POLL_MS));
    report = await api<ReportRead>(`/reports/${report.id}`);
  }
  if (report.status === "failed") throw new Error(report.error ?? "The report failed");
  await download(`/reports/${report.id}/download`, report.filename ?? `report.${report.format}`);
  return report;
}

/** "Download report" with a PDF / Excel choice, for a fixed report type and parameters. */
export function ReportButton({
  reportType,
  parameters,
  label = "Report",
  size = "sm",
}: {
  reportType: ReportRequest["report_type"];
  parameters: Record<string, unknown>;
  label?: string;
  size?: "sm" | "default";
}) {
  const queryClient = useQueryClient();
  const canRead = useCan(P.REPORT_READ);
  const [busy, setBusy] = useState(false);
  if (!canRead) return null;

  async function run(format: "pdf" | "xlsx") {
    setBusy(true);
    try {
      await generateReport({ report_type: reportType, format, parameters });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size={size} disabled={busy} />}>
        <FileDown /> {busy ? "Preparing…" : label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void run("pdf")}>PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void run("xlsx")}>Excel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
