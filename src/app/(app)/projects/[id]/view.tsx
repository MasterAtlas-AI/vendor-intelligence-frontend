"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, FilePlus, Plus, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { NewRfqDialog } from "@/components/rfqs/new-rfq-dialog";
import { PageHeader } from "@/components/page-header";
import { ReportButton } from "@/components/reports/report-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { CursorPage, ProjectMember, ProjectRead, ProjectVendor, Scorecard, UserRead, VendorPage } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { humanize } from "@/lib/format";
import { MEMBER_ROLES, PROJECT_STATUSES, STAGES } from "@/lib/projects";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

function AddVendor({ projectId, existing }: { projectId: string; existing: Set<string> }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 300);
  const found = useQuery({
    queryKey: ["vendors", "pick", term],
    queryFn: ({ signal }) => api<VendorPage>("/vendors", { query: { q: term, limit: 8 }, signal }),
    enabled: term.length >= 2,
  });
  const add = useMutation({
    mutationFn: (vendorId: string) =>
      api<ProjectVendor[]>(`/projects/${projectId}/vendors`, { method: "POST", body: { vendor_id: vendorId } }),
    onSuccess: (rows) => {
      queryClient.setQueryData(["project-vendors", projectId], rows);
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setQ("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-2">
      <Input aria-label="Find a vendor to add" placeholder="Add a vendor: type a name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {term.length >= 2 && found.data && (
        <div className="grid gap-1 rounded-md border p-1">
          {found.data.items.length === 0 && <p className="p-2 text-sm text-muted-foreground">No vendors match.</p>}
          {found.data.items.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={existing.has(v.id) || add.isPending}
              className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              onClick={() => add.mutate(v.id)}
            >
              <span>
                {v.display_name}
                <span className="ml-2 text-xs text-muted-foreground">{v.hq_country && countryName(v.hq_country)}</span>
              </span>
              <span className="text-xs text-muted-foreground">{existing.has(v.id) ? "On the project" : <Plus className="size-4" />}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Vendors({ project }: { project: ProjectRead }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canScore = useCan(P.SCORECARD_MANAGE) && project.can_edit;
  const key = ["project-vendors", project.id];
  const vendors = useQuery({ queryKey: key, queryFn: () => api<ProjectVendor[]>(`/projects/${project.id}/vendors`) });
  const after = (rows?: ProjectVendor[]) => {
    if (rows) queryClient.setQueryData(key, rows);
    else void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  };
  const update = useMutation({
    mutationFn: ({ vendorId, stage }: { vendorId: string; stage: string }) =>
      api<ProjectVendor[]>(`/projects/${project.id}/vendors/${vendorId}`, { method: "PATCH", body: { stage } }),
    onSuccess: after,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (vendorId: string) => api(`/projects/${project.id}/vendors/${vendorId}`, { method: "DELETE" }),
    onSuccess: () => after(),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const score = useMutation({
    mutationFn: (vendorId: string) =>
      api<Scorecard>("/scorecards", { method: "POST", body: { vendor_id: vendorId, project_id: project.id } }),
    onSuccess: (card) => router.push(`/scorecards/${card.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = vendors.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendors</CardTitle>
        <CardDescription>Ranked by their latest scorecard on this project. Move vendors from longlist to shortlist to selected.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {project.can_edit && <AddVendor projectId={project.id} existing={new Set(rows.map((r) => r.vendor.id))} />}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.isPending && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {vendors.isSuccess && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center whitespace-normal text-muted-foreground">
                    No vendors yet. Add them above, or from a vendor&apos;s page or a search.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.vendor.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{r.rank ?? "—"}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <Link href={`/vendors/${r.vendor.id}`} className="font-medium hover:underline">
                      {r.vendor.display_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[r.vendor.hq_country && countryName(r.vendor.hq_country), r.note].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {project.can_edit ? (
                      <FilterSelect
                        label={`Stage of ${r.vendor.display_name}`}
                        anyLabel="Longlist"
                        value={r.stage === "longlist" ? "" : r.stage}
                        onChange={(stage) => update.mutate({ vendorId: r.vendor.id, stage: stage || "longlist" })}
                        options={STAGES.filter((s) => s.value !== "longlist")}
                        className="w-32"
                      />
                    ) : (
                      <StatusBadge status={r.stage} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.scorecard ? (
                      <Link href={`/scorecards/${r.scorecard.scorecard_id}`} className="tabular-nums hover:underline">
                        {r.scorecard.total_score !== null ? Number(r.scorecard.total_score).toFixed(0) : "—"}
                        <span className="ml-1 text-xs text-muted-foreground">{r.scorecard.status === "draft" ? "draft" : ""}</span>
                      </Link>
                    ) : canScore ? (
                      <Button size="xs" variant="outline" disabled={score.isPending} onClick={() => score.mutate(r.vendor.id)}>
                        <ClipboardList /> Score
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {project.can_edit && (
                      <Button size="xs" variant="ghost" aria-label={`Remove ${r.vendor.display_name}`} onClick={() => remove.mutate(r.vendor.id)}>
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Members({ project }: { project: ProjectRead }) {
  const queryClient = useQueryClient();
  const manager = useCan(P.PROJECT_MANAGE);
  const canManage = manager || project.my_role === "owner";
  const canListUsers = useCan(P.USER_READ);
  const key = ["project-members", project.id];
  const members = useQuery({ queryKey: key, queryFn: () => api<ProjectMember[]>(`/projects/${project.id}/members`) });
  const users = useQuery({
    queryKey: ["users", "for-projects"],
    queryFn: () => api<CursorPage<UserRead>>("/users", { query: { limit: 100 } }),
    enabled: canManage && canListUsers,
  });
  const [pick, setPick] = useState("");
  const set = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api<ProjectMember[]>(`/projects/${project.id}/members/${userId}`, { method: "PUT", body: { role } }),
    onSuccess: (rows) => {
      queryClient.setQueryData(key, rows);
      setPick("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/projects/${project.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const memberIds = new Set((members.data ?? []).map((m) => m.user_id));
  const candidates = (users.data?.items ?? []).filter((u) => !memberIds.has(u.id) && u.status !== "disabled");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>Owners manage members; editors change vendors and scores; viewers read.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {members.isPending && <Skeleton className="h-12" />}
        {members.data?.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{m.full_name}</div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            {canManage ? (
              <div className="flex items-center gap-1">
                <FilterSelect
                  label={`Role of ${m.full_name}`}
                  anyLabel="Viewer"
                  value={m.role === "viewer" ? "" : m.role}
                  onChange={(role) => set.mutate({ userId: m.user_id, role: role || "viewer" })}
                  options={MEMBER_ROLES.filter((r) => r.value !== "viewer").map((r) => ({ ...r }))}
                  className="w-28"
                />
                <Button size="xs" variant="ghost" aria-label={`Remove ${m.full_name}`} onClick={() => remove.mutate(m.user_id)}>
                  <Trash2 />
                </Button>
              </div>
            ) : (
              <StatusBadge status={m.role} />
            )}
          </div>
        ))}
        {canManage && canListUsers && candidates.length > 0 && (
          <div className="flex gap-2 border-t pt-3">
            <FilterSelect
              label="Add a member"
              anyLabel="Add a member…"
              value={pick}
              onChange={setPick}
              options={candidates.map((u) => ({ value: u.id, label: u.full_name }))}
              className="w-full"
            />
            <Button size="sm" variant="outline" disabled={!pick || set.isPending} onClick={() => set.mutate({ userId: pick, role: "editor" })}>
              <UserPlus /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const project = useQuery({ queryKey: ["project", id], queryFn: () => api<ProjectRead>(`/projects/${id}`) });
  const canRfq = useCan(P.RFQ_MANAGE);
  const [rfqOpen, setRfqOpen] = useState(false);
  const setStatus = useMutation({
    mutationFn: (status: string) =>
      api<ProjectRead>(`/projects/${id}`, { method: "PATCH", body: { status, version: project.data!.version } }),
    onSuccess: (p) => {
      queryClient.setQueryData(["project", id], p);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      void project.refetch();
    },
  });

  if (project.isPending) return <Skeleton className="h-64" />;
  if (project.isError) return <p className="text-sm text-muted-foreground">{errorMessage(project.error)}</p>;
  const p = project.data;

  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> Projects
      </Link>
      <PageHeader
        title={p.name}
        description={[p.code, p.client, p.facility_type, p.country && countryName(p.country)].filter(Boolean).join(" · ")}
        actions={
          <>
            <ReportButton reportType="vendor_comparison" parameters={{ project_id: p.id }} label="Comparison" size="default" />
            {canRfq && (
              <Button variant="outline" onClick={() => setRfqOpen(true)}>
                <FilePlus /> Create RFQ
              </Button>
            )}
            {p.can_edit ? (
            <FilterSelect
              label="Project status"
              anyLabel="Active"
              value={p.status === "active" ? "" : p.status}
              onChange={(s) => setStatus.mutate(s || "active")}
              options={PROJECT_STATUSES.filter((s) => s !== "active").map((s) => ({ value: s, label: humanize(s) }))}
              className="w-36"
            />
          ) : (
            <StatusBadge status={p.status} />
          )}
          </>
        }
      />
      <NewRfqDialog open={rfqOpen} onOpenChange={setRfqOpen} projectId={p.id} />
      {p.description &&<p className="mb-4 max-w-3xl text-sm whitespace-pre-wrap text-muted-foreground">{p.description}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Vendors project={p} />
        <div className="grid content-start gap-4">
          <Members project={p} />
        </div>
      </div>
    </>
  );
}
