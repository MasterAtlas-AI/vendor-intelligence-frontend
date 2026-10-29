"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import type { ProjectRead, Scorecard, VendorDetail } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/validation";

/** The organization's projects this vendor is on, its scorecards, and "add to project". */
export function ProjectsCard({ vendor }: { vendor: VendorDetail }) {
  const queryClient = useQueryClient();
  const actAs = useAuth((s) => s.actAs);
  const onProjects = useQuery({
    queryKey: ["vendor-projects", vendor.id, actAs?.id],
    queryFn: () => api<ProjectRead[]>(`/vendors/${vendor.id}/projects`),
  });
  const mine = useQuery({ queryKey: ["projects", actAs?.id, ""], queryFn: () => api<ProjectRead[]>("/projects") });
  const cards = useQuery({
    queryKey: ["scorecards", "vendor", vendor.id, actAs?.id],
    queryFn: () => api<Scorecard[]>("/scorecards", { query: { vendor_id: vendor.id } }),
  });
  const [pick, setPick] = useState("");
  const add = useMutation({
    mutationFn: (projectId: string) =>
      api(`/projects/${projectId}/vendors`, { method: "POST", body: { vendor_id: vendor.id, stage: "longlist" } }),
    onSuccess: () => {
      toast.success("Added to the project's longlist");
      setPick("");
      void queryClient.invalidateQueries({ queryKey: ["vendor-projects", vendor.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const onIds = new Set((onProjects.data ?? []).map((p) => p.id));
  const addable = (mine.data ?? []).filter((p) => p.can_edit && !onIds.has(p.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>Your organization&apos;s projects and scorecards for this vendor.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {onProjects.data?.length === 0 && <p className="text-muted-foreground">Not on any of your projects.</p>}
        {onProjects.data?.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <Link href={`/projects/${p.id}`} className="truncate hover:underline">
              {p.name}
            </Link>
            <StatusBadge status={p.status} />
          </div>
        ))}
        {(cards.data ?? []).length > 0 && (
          <div className="grid gap-1 border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground">Scorecards</span>
            {cards.data!.map((c) => (
              <Link key={c.id} href={`/scorecards/${c.id}`} className="flex items-center justify-between gap-2 hover:underline">
                <span className="truncate">{c.project_name ?? c.title}</span>
                <span className="tabular-nums">
                  {c.total_score !== null ? Number(c.total_score).toFixed(0) : "—"}
                  <span className="ml-1 text-xs text-muted-foreground">{c.status === "draft" ? "draft" : ""}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
        {addable.length > 0 && (
          <div className="flex gap-2 border-t pt-3">
            <FilterSelect
              label="Add to a project"
              anyLabel="Add to a project…"
              value={pick}
              onChange={setPick}
              options={addable.map((p) => ({ value: p.id, label: p.name }))}
              className="w-full"
            />
            <Button size="sm" variant="outline" disabled={!pick || add.isPending} onClick={() => add.mutate(pick)} aria-label="Add to project">
              <FolderPlus />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
