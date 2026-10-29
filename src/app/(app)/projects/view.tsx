"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { ProjectRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize, timeAgo } from "@/lib/format";
import { PROJECT_STATUSES } from "@/lib/projects";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

const EMPTY = { name: "", code: "", client: "", facility_type: "", country: "", description: "" };

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const create = useMutation({
    mutationFn: () =>
      api<ProjectRead>("/projects", {
        method: "POST",
        body: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || (k === "description" ? "" : null)])),
      }),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setForm(EMPTY);
      onOpenChange(false);
      router.push(`/projects/${p.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const field = (key: keyof typeof EMPTY, label: string, placeholder = "") => (
    <div className="grid gap-1.5">
      <Label htmlFor={`project-${key}`}>{label}</Label>
      <Input id={`project-${key}`} placeholder={placeholder} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A package or bid you&apos;re sourcing vendors for. You become its owner.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {field("name", "Name", "e.g. Water injection pumps - FPSO Bacalhau")}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("code", "Project number")}
            {field("client", "Client / operator")}
            {field("facility_type", "Facility", "FPSO, refinery, LNG…")}
            {field("country", "Country")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>
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
  const [creating, setCreating] = useState(false);
  const projects = useQuery({
    queryKey: ["projects", actAs?.id, status],
    queryFn: () => api<ProjectRead[]>("/projects", { query: { status } }),
  });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Shortlist vendors for a package or bid, score them and see them ranked."
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <FolderPlus /> New project
            </Button>
          )
        }
      />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          anyLabel="Open projects"
          value={status}
          onChange={setStatus}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
        />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Shortlisted / all vendors</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.isPending && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {projects.isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">
                  {errorMessage(projects.error)}
                </TableCell>
              </TableRow>
            )}
            {projects.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center whitespace-normal text-muted-foreground">
                  {canCreate ? "No projects yet. Create one to start a shortlist." : "You're not on any project yet. A manager can add you."}
                </TableCell>
              </TableRow>
            )}
            {projects.data?.map((p) => {
              const counts = p.vendor_counts ?? {};
              const all = Object.values(counts).reduce((a, b) => a + b, 0);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[p.code, p.facility_type, p.country && countryName(p.country)].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.client || "—"}</TableCell>
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
