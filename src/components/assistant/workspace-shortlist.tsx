"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, FolderPlus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import type { ChatResponse, ProjectRead, Rfq } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

import { activeDims, Bar, Chip, DEFAULT_WEIGHTS, Panel, type Ranked, requirementChips, type Weights } from "./workspace-shared";

function csv(rows: Ranked[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Rank", "Vendor", "Country", "Score /10", "Equipment", "Standards", "References", "FPSO references", "AVL", "Website", "Flags"];
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? "" : `${Math.round(x * 100)}%`);
  return [
    head.map(cell).join(","),
    ...rows.map((r) =>
      [r.rank, r.name, countryName(r.country), r.score, pct(r.scores.equipment), pct(r.scores.standards), r.references, r.fpso_references, r.avl_status ?? "", r.website ?? "", r.flags.join("; ")]
        .map(cell)
        .join(","),
    ),
  ].join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/** Adds the chosen vendors to one of the organization's projects (longlist stage). */
function AddToProject({ open, onOpenChange, vendorIds }: { open: boolean; onOpenChange: (o: boolean) => void; vendorIds: string[] }) {
  const projects = useQuery({ queryKey: ["projects", "active"], queryFn: () => api<ProjectRead[]>("/projects?status=active"), enabled: open });
  const [projectId, setProjectId] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      for (const vendor_id of vendorIds) await api(`/projects/${projectId}/vendors`, { method: "POST", body: { vendor_id, note: "Added from the assistant" } });
    },
    onSuccess: () => {
      onOpenChange(false);
      toast.success(`${vendorIds.length} vendor${vendorIds.length === 1 ? "" : "s"} added to the project`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to project</DialogTitle>
          <DialogDescription>
            Adds {vendorIds.length} vendor{vendorIds.length === 1 ? "" : "s"} to the project&apos;s longlist.
          </DialogDescription>
        </DialogHeader>
        {projects.data && !projects.data.length ? (
          <p className="text-sm text-muted-foreground">You have no active projects yet. Create one on the Projects page.</p>
        ) : (
          <select
            aria-label="Project"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={projects.isPending}
          >
            <option value="">{projects.isPending ? "Loading projects…" : "Choose a project"}</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} · ` : ""}
                {p.name}
              </option>
            ))}
          </select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!projectId || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Adding…" : "Add vendors"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShortlistTab({
  reply,
  question,
  ranked,
  weights,
  onWeights,
  onOpenVendor,
}: {
  reply: ChatResponse;
  question: string;
  ranked: Ranked[];
  weights: Weights;
  onWeights: (w: Weights) => void;
  onOpenVendor: (id: string) => void;
}) {
  const router = useRouter();
  const canProject = useCan(P.PROJECT_MANAGE);
  const canRfq = useCan(P.RFQ_MANAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [projectOpen, setProjectOpen] = useState(false);
  const dims = activeDims(reply.shortlist ?? []);
  const chips = requirementChips(reply.requirement);
  const chosen = ranked.filter((r) => picked.has(r.vendor_id));
  const targets = chosen.length ? chosen : ranked.slice(0, 5);

  const rfq = useMutation({
    mutationFn: async () => {
      const created = await api<Rfq>("/rfqs", {
        method: "POST",
        body: { title: question.slice(0, 200) || "RFQ from the assistant", description: question.slice(0, 5000), equipment_categories: (reply.requirement?.equipment_categories ?? []).slice(0, 10) },
      });
      for (const r of targets) await api(`/rfqs/${created.id}/vendors`, { method: "POST", body: { vendor_id: r.vendor_id } });
      return created;
    },
    onSuccess: (created) => {
      toast.success(`Draft ${created.rfq_number} created with ${targets.length} vendors`);
      router.push(`/rfqs/${created.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const flagged = ranked.filter((r) => r.flags.length).length;
  const references = ranked.reduce((n, r) => n + r.references, 0);
  const approved = ranked.filter((r) => r.avl_status === "approved").length;

  return (
    <div className="grid gap-4">
      <Panel title="Requirement understood">
        {chips.length ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((c, i) => (
              <span key={i} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">{c.label}:</span> <span className="font-medium">{c.value}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No specific equipment, standard or country was detected; vendors were matched on the wording.</p>
        )}
      </Panel>

      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title="Scoring weights (live)"
          actions={
            <Button variant="ghost" size="sm" onClick={() => onWeights(DEFAULT_WEIGHTS)}>
              <RotateCcw /> Reset
            </Button>
          }
        >
          <div className="grid gap-2.5">
            {dims.map((d) => (
              <label key={d.key} className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                <span className="truncate">{d.label}</span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={weights[d.key]}
                  onChange={(e) => onWeights({ ...weights, [d.key]: Number(e.target.value) })}
                  className="w-full accent-primary"
                  aria-label={`${d.label} weight`}
                />
                <span className="text-right font-medium tabular-nums">{weights[d.key]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Moving a slider re-ranks the shortlist instantly. Only dimensions this request asked about are shown.</p>
        </Panel>
        <Panel title="Screening summary">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Vendors considered</dt>
            <dd className="text-right font-medium">{ranked.length}</dd>
            <dt className="text-muted-foreground">With gaps to check</dt>
            <dd className="text-right font-medium">{flagged}</dd>
            <dt className="text-muted-foreground">Project references on record</dt>
            <dd className="text-right font-medium">{references}</dd>
            <dt className="text-muted-foreground">On your approved list</dt>
            <dd className="text-right font-medium">{approved}</dd>
            <dt className="text-muted-foreground">Web pages found</dt>
            <dd className="text-right font-medium">{(reply.web_sources ?? []).length}</dd>
            <dt className="text-muted-foreground">Prices and lead times</dt>
            <dd className="text-right text-xs text-muted-foreground">from RFQ quotes</dd>
          </dl>
        </Panel>
      </div>

      <Panel
        title="Ranked vendor shortlist"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => download("vendor-shortlist.csv", csv(ranked))} disabled={!ranked.length}>
              <Download /> Export CSV
            </Button>
            {canProject && (
              <Button variant="outline" size="sm" onClick={() => setProjectOpen(true)} disabled={!ranked.length}>
                <FolderPlus /> Add {chosen.length ? chosen.length : "top 5"} to project
              </Button>
            )}
            {canRfq && (
              <Button size="sm" onClick={() => rfq.mutate()} disabled={!ranked.length || rfq.isPending}>
                <FileText /> {rfq.isPending ? "Creating…" : `Start RFQ with ${chosen.length || "top 5"}`}
              </Button>
            )}
          </>
        }
      >
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2" />
                <th className="w-8 p-2">#</th>
                <th className="p-2">Vendor</th>
                <th className="w-32 p-2">Score</th>
                <th className="p-2">Equipment</th>
                <th className="p-2">Standards</th>
                <th className="p-2">References</th>
                <th className="p-2">AVL</th>
                <th className="p-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.vendor_id} className={`cursor-pointer border-t hover:bg-muted/40 ${r.rank === 1 ? "bg-primary/5" : ""}`} onClick={() => onOpenVendor(r.vendor_id)}>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${r.name}`}
                      checked={picked.has(r.vendor_id)}
                      onCheckedChange={(c) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (c) next.add(r.vendor_id);
                          else next.delete(r.vendor_id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="p-2">
                    <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${r.rank === 1 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{r.rank}</span>
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{[countryName(r.country), r.city].filter((x) => x && x !== "—").join(" · ")}</div>
                  </td>
                  <td className="p-2">
                    <div className="text-sm">
                      <span className="font-semibold">{r.score.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">/10</span>
                    </div>
                    <Bar value={r.score / 10} className="mt-1" />
                  </td>
                  <td className="p-2 tabular-nums">{r.scores.equipment === null || r.scores.equipment === undefined ? "—" : `${Math.round(r.scores.equipment * 100)}%`}</td>
                  <td className="p-2 tabular-nums">{r.scores.standards === null || r.scores.standards === undefined ? "—" : `${Math.round(r.scores.standards * 100)}%`}</td>
                  <td className="p-2 tabular-nums">
                    {r.references}
                    {r.fpso_references > 0 && <span className="text-xs text-muted-foreground"> ({r.fpso_references} FPSO)</span>}
                  </td>
                  <td className="p-2">{r.avl_status ? <StatusBadge status={r.avl_status} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {r.flags.length ? r.flags.slice(0, 2).map((f) => <Chip key={f} tone="warn">{f}</Chip>) : <Chip tone="ok">None</Chip>}
                      {r.flags.length > 2 && <Chip>+{r.flags.length - 2}</Chip>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Click a vendor for its scorecard. Scores use only facts in the knowledge base; web findings are listed separately in the answer and on Sources.</p>
      </Panel>
      <AddToProject open={projectOpen} onOpenChange={setProjectOpen} vendorIds={targets.map((r) => r.vendor_id)} />
    </div>
  );
}
