"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OverlayDialog } from "@/components/vendors/overlay-dialog";
import { ProjectsCard } from "@/components/vendors/projects-card";
import { ResearchCard } from "@/components/vendors/research-card";
import { VendorFacts } from "@/components/vendors/vendor-facts";
import { api } from "@/lib/api/client";
import type { VendorDetail } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

function YourRecord({ vendor }: { vendor: VendorDetail }) {
  const queryClient = useQueryClient();
  const canEdit = useCan(P.TENANT_VENDOR_APPROVE);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const t = vendor.tenant;

  const remove = useMutation({
    mutationFn: () => api(`/my-vendors/${vendor.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Removed from your list");
      void queryClient.invalidateQueries({ queryKey: ["vendor", vendor.id] });
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setRemoving(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your organization</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {t ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge status={t.avl_status} />
            </dd>
            <dt className="text-muted-foreground">Vendor code</dt>
            <dd className="font-mono text-xs">{t.internal_vendor_code || "—"}</dd>
            <dt className="text-muted-foreground">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {t.tags.length ? t.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>) : "—"}
            </dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{t.notes || "—"}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{timeAgo(t.updated_at)}</dd>
          </dl>
        ) : (
          <p className="text-muted-foreground">This vendor isn&apos;t on your organization&apos;s list.</p>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={t ? "outline" : "default"} onClick={() => setEditing(true)}>
              {t ? <Pencil /> : <Plus />} {t ? "Edit" : "Add to my vendors"}
            </Button>
            {t && (
              <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>
                <Trash2 /> Remove
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <OverlayDialog vendor={vendor} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove from your list?"
        description="Your status, code, tags and notes for this vendor are deleted. The vendor stays in the knowledge base."
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const actAs = useAuth((s) => s.actAs);
  const hasTenant = useAuth((s) => Boolean(s.user?.tenant || s.actAs));
  const vendor = useQuery({
    queryKey: ["vendor", id, actAs?.id],
    queryFn: () => api<VendorDetail>(`/vendors/${id}`),
  });

  if (vendor.isPending) return <Skeleton className="h-64" />;
  if (vendor.isError) return <p className="text-sm text-muted-foreground">{errorMessage(vendor.error)}</p>;
  const v = vendor.data;
  const hq = [v.hq_city, v.hq_country && countryName(v.hq_country)].filter(Boolean).join(", ");

  return (
    <>
      <Link href="/vendors" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> Vendors
      </Link>
      <PageHeader
        title={v.display_name}
        description={[v.legal_name !== v.display_name ? v.legal_name : null, hq].filter(Boolean).join(" · ")}
        actions={
          v.website && (
            <Button variant="outline" render={<a href={v.website} target="_blank" rel="noreferrer noopener" />}>
              <ExternalLink /> Website
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {v.description ? <p className="whitespace-pre-wrap">{v.description}</p> : <p className="text-muted-foreground">No description yet.</p>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={v.status} />
                </dd>
                <dt className="text-muted-foreground">Domains</dt>
                <dd>{v.domains.join(", ") || "—"}</dd>
                <dt className="text-muted-foreground">Also known as</dt>
                <dd>{v.aliases.join(", ") || "—"}</dd>
                <dt className="text-muted-foreground">Industries</dt>
                <dd className="flex flex-wrap gap-1">
                  {v.industries.length ? v.industries.map((i) => <Badge key={i.id} variant="secondary">{i.name}</Badge>) : "—"}
                </dd>
                <dt className="text-muted-foreground">Knowledge version</dt>
                <dd>
                  {v.knowledge_version}
                  {v.last_verified_at && <span className="text-muted-foreground"> · verified {timeAgo(v.last_verified_at)}</span>}
                </dd>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <VendorFacts vendor={v} />
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          {hasTenant && <YourRecord vendor={v} />}
          {hasTenant && <ProjectsCard vendor={v} />}
          {v.status !== "retired" && <ResearchCard vendor={v} />}
        </div>
      </div>
    </>
  );
}
