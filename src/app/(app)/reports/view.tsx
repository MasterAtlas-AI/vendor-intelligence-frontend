"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FilePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { generateReport } from "@/components/reports/report-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { treeItems, useEquipmentCategories } from "@/hooks/use-taxonomy";
import { api, download } from "@/lib/api/client";
import type { ProjectRead, ReportRead, ReportRequest, Rfq } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { AVL_OPTIONS } from "@/lib/vendors";

type ReportType = ReportRequest["report_type"];

const TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: "market_scan", label: "Market scan", description: "Who makes a kind of equipment, where they are and what they hold." },
  { value: "vendor_comparison", label: "Vendor comparison", description: "A project's vendors side by side, with stage and score." },
  { value: "avl", label: "Approved vendor list", description: "Your organization's vendor list with statuses, codes and tags." },
  { value: "rfq_summary", label: "RFQ summary", description: "One RFQ's quotes, lead times, scores and award." },
];

function NewReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const actAs = useAuth((s) => s.actAs);
  const [type, setType] = useState<ReportType>("market_scan");
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [category, setCategory] = useState("");
  const [project, setProject] = useState("");
  const [rfq, setRfq] = useState("");
  const [avl, setAvl] = useState("");
  const [busy, setBusy] = useState(false);
  const equipment = useEquipmentCategories();
  const projects = useQuery({ queryKey: ["projects", actAs?.id, ""], queryFn: () => api<ProjectRead[]>("/projects"), enabled: open });
  const rfqs = useQuery({ queryKey: ["rfqs", actAs?.id, ""], queryFn: () => api<Rfq[]>("/rfqs"), enabled: open });

  const parameters: Record<string, unknown> =
    type === "market_scan" ? { equipment_category: category }
    : type === "vendor_comparison" ? { project_id: project }
    : type === "rfq_summary" ? { rfq_id: rfq }
    : avl ? { avl_status: [avl] } : {};
  const ready = type === "avl" || Object.values(parameters).every(Boolean);

  async function create() {
    setBusy(true);
    try {
      await generateReport({ report_type: type, format, parameters });
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New report</DialogTitle>
          <DialogDescription>{TYPES.find((t) => t.value === type)?.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Report</Label>
            <FilterSelect label="Report type" anyLabel="Market scan" value={type === "market_scan" ? "" : type}
              onChange={(v) => setType((v || "market_scan") as ReportType)}
              options={TYPES.filter((t) => t.value !== "market_scan")} className="w-full" />
          </div>
          {type === "market_scan" && (
            <div className="grid gap-1.5">
              <Label>Equipment</Label>
              <FilterSelect label="Equipment category" anyLabel="Choose a category…" value={category} onChange={setCategory}
                options={treeItems(equipment.data)} className="w-full" />
            </div>
          )}
          {type === "vendor_comparison" && (
            <div className="grid gap-1.5">
              <Label>Project</Label>
              <FilterSelect label="Project" anyLabel="Choose a project…" value={project} onChange={setProject}
                options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} className="w-full" />
            </div>
          )}
          {type === "rfq_summary" && (
            <div className="grid gap-1.5">
              <Label>RFQ</Label>
              <FilterSelect label="RFQ" anyLabel="Choose an RFQ…" value={rfq} onChange={setRfq}
                options={(rfqs.data ?? []).map((r) => ({ value: r.id, label: `${r.rfq_number} ${r.title}` }))} className="w-full" />
            </div>
          )}
          {type === "avl" && (
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <FilterSelect label="AVL status" anyLabel="All statuses" value={avl} onChange={setAvl} options={AVL_OPTIONS} className="w-full" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Format</Label>
            <FilterSelect label="Format" anyLabel="PDF" value={format === "pdf" ? "" : format}
              onChange={(v) => setFormat(v === "xlsx" ? "xlsx" : "pdf")} options={[{ value: "xlsx", label: "Excel" }]} className="w-40" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!ready || busy} onClick={() => void create()}>
            {busy ? "Preparing…" : "Create and download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReportsPage() {
  const actAs = useAuth((s) => s.actAs);
  const [creating, setCreating] = useState(false);
  const reports = useQuery({
    queryKey: ["reports", actAs?.id],
    queryFn: () => api<ReportRead[]>("/reports"),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "queued") ? 3000 : false),
  });

  return (
    <>
      <PageHeader
        title="Reports"
        description="Market scans, vendor comparisons, your approved vendor list and RFQ summaries, as PDF or Excel."
        actions={
          <Button onClick={() => setCreating(true)}>
            <FilePlus /> New report
          </Button>
        }
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.isPending && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {reports.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No reports yet.
                </TableCell>
              </TableRow>
            )}
            {reports.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-md whitespace-normal">
                  <div className="font-medium">{r.title}</div>
                  {r.error && <div className="text-xs text-destructive">{r.error}</div>}
                </TableCell>
                <TableCell className="text-sm uppercase">{r.format === "xlsx" ? "Excel" : "PDF"}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                <TableCell className="text-right">
                  {r.status === "ready" && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => download(`/reports/${r.id}/download`, r.filename ?? `report.${r.format}`).catch((e) => toast.error(errorMessage(e)))}
                    >
                      <Download /> Download
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <NewReportDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
