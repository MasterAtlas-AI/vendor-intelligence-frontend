"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { EMPTY_PROJECT, ProjectFields, formToBody, yearInvalid, type ProjectFormValues } from "@/components/projects/project-form";
import { PROJECT_KINDS, kindLabel } from "@/components/projects/shared";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { ProjectRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize, timeAgo } from "@/lib/format";
import { PROJECT_STATUSES } from "@/lib/projects";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProjectFormValues>(EMPTY_PROJECT);
  const create = useMutation({
    mutationFn: () => api<ProjectRead>("/projects", { method: "POST", body: formToBody(form) }),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setForm(EMPTY_PROJECT);
      onOpenChange(false);
      router.push(`/projects/${p.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A package or bid you&apos;re sourcing vendors for, or an executed project whose MEL, POs and lessons you want to keep. You become its owner.</DialogDescription>
        </DialogHeader>
        <ProjectFields form={form} onChange={setForm} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!form.name.trim() || yearInvalid(form) || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectsPage() {
  const canCreate = useCan(P.PROJECT_MANAGE);
  const actAs = useAuth((s) => s.actAs);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [creating, setCreating] = useState(false);
  const projects = useQuery({
    queryKey: ["projects", actAs?.id, status],
    queryFn: () => api<ProjectRead[]>("/projects", { query: { status } }),
  });

  const rows = (projects.data ?? []).filter((p) => !kind || p.kind === kind);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Shortlist vendors for a package or bid, or record an executed project's equipment, POs and lessons learned."
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <FolderPlus /> New project
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterSelect
          label="Status"
          anyLabel="Open projects"
          value={status}
          onChange={setStatus}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
        />
        <FilterSelect label="Kind" anyLabel="All kinds" value={kind} onChange={setKind} options={PROJECT_KINDS} />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Shortlisted / all vendors</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {projects.isError && (
              <TableRow>
                <TableCell colSpan={6} className="text-destructive">
                  {errorMessage(projects.error)}
                </TableCell>
              </TableRow>
            )}
            {projects.isSuccess && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center whitespace-normal text-muted-foreground">
                  {kind && projects.data.length > 0
                    ? "No projects of this kind."
                    : canCreate
                      ? "No projects yet. Create one to start a shortlist or record an executed project."
                      : "You're not on any project yet. A manager can add you."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => {
              const counts = p.vendor_counts ?? {};
              const all = Object.values(counts).reduce((a, b) => a + b, 0);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[p.code, p.facility_type, p.country && countryName(p.country), p.location && humanize(p.location), p.year]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.client || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={p.kind === "historical" ? "secondary" : "outline"}>{kindLabel(p.kind)}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {(counts.shortlist ?? 0) + (counts.selected ?? 0)} / {all}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timeAgo(p.updated_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
