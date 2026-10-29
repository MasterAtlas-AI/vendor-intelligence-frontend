"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import type { ProjectRead, Rfq } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/validation";

/** New RFQ, optionally for a project and pre-filled with its shortlist. Also used from the project page. */
export function NewRfqDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId?: string;
}) {
  const router = useRouter();
  const actAs = useAuth((s) => s.actAs);
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [due, setDue] = useState("");
  const [project, setProject] = useState(projectId ?? "");
  const [fromShortlist, setFromShortlist] = useState(Boolean(projectId));
  const projects = useQuery({
    queryKey: ["projects", actAs?.id, ""],
    queryFn: () => api<ProjectRead[]>("/projects"),
    enabled: open && !projectId,
  });
  const create = useMutation({
    mutationFn: () =>
      api<Rfq>("/rfqs", {
        method: "POST",
        body: {
          title: title.trim(),
          rfq_number: number.trim() || null,
          due_date: due || null,
          project_id: project || null,
          from_shortlist: Boolean(project) && fromShortlist,
        },
      }),
    onSuccess: (r) => {
      onOpenChange(false);
      router.push(`/rfqs/${r.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New RFQ</DialogTitle>
          <DialogDescription>A request for quotation, created as a draft you can review before issuing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rfq-title">Title</Label>
            <Input id="rfq-title" placeholder='e.g. Ball valves 2" - 24" API 6D' value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rfq-number">RFQ number</Label>
              <Input id="rfq-number" placeholder="Automatic" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rfq-due">Quotes due</Label>
              <Input id="rfq-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          {!projectId && (
            <div className="grid gap-1.5">
              <Label>Project</Label>
              <FilterSelect
                label="Project"
                anyLabel="No project"
                value={project}
                onChange={setProject}
                options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                className="w-full"
              />
            </div>
          )}
          {project && (
            <Label className="flex items-start gap-2.5 font-normal">
              <Checkbox aria-label="Add the project's shortlist" className="mt-0.5" checked={fromShortlist} onCheckedChange={(c) => setFromShortlist(Boolean(c))} />
              <span>Add the project&apos;s shortlisted and selected vendors</span>
            </Label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
