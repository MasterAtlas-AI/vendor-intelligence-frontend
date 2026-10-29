"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { TenantRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

function OrganizationForm({ tenant }: { tenant: TenantRead }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tenant.name);
  const save = useMutation({
    mutationFn: () => api<TenantRead>("/tenant", { method: "PATCH", body: { name: name.trim() } }),
    onSuccess: (t) => {
      queryClient.setQueryData(["tenant", t.id], t);
      void queryClient.invalidateQueries({ queryKey: ["tenant"] });
      toast.success("Organization updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{tenant.name}</CardTitle>
        <CardDescription className="flex items-center gap-2">
          <StatusBadge status={tenant.status} /> {tenant.plan} plan · since {formatDateTime(tenant.created_at)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 py-4">
        <FormField id="org-name" label="Organization name">
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField id="org-slug" label="Workspace ID" hint="Set when the organization was created; can't be changed.">
          <Input id="org-slug" value={tenant.slug} readOnly disabled />
        </FormField>
      </CardContent>
      <CardFooter>
        <Button
          disabled={save.isPending || name.trim().length < 2 || name.trim() === tenant.name}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

function SearchSettings({ tenant }: { tenant: TenantRead }) {
  const queryClient = useQueryClient();
  const enabled = Boolean((tenant.settings as Record<string, unknown>)?.search_rerank);
  const save = useMutation({
    mutationFn: (on: boolean) =>
      api<TenantRead>("/tenant", { method: "PATCH", body: { settings: { ...tenant.settings, search_rerank: on } } }),
    onSuccess: (t) => {
      queryClient.setQueryData(["tenant", "own"], t);
      toast.success("Search settings saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Search</CardTitle>
        <CardDescription>How vendor search ranks results for everyone in your organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <Label className="flex items-start gap-2.5 font-normal">
          <Checkbox
            aria-label="AI re-ranking of search results"
            className="mt-0.5"
            checked={enabled}
            disabled={save.isPending}
            onCheckedChange={(c) => save.mutate(Boolean(c))}
          />
          <span className="grid gap-0.5">
            <span className="font-medium">AI re-ranking</span>
            <span className="text-xs text-muted-foreground">
              The AI judges the technical fit of the top 20 results for each search and explains it in one line. About
              US$0.003 per search from your monthly AI budget; search falls back to the normal order if the budget runs out.
            </span>
          </span>
        </Label>
      </CardContent>
    </Card>
  );
}

export default function OrganizationPage() {
  const canManage = useCan(P.TENANT_SETTINGS_MANAGE);
  const tenant = useQuery({ queryKey: ["tenant", "own"], queryFn: () => api<TenantRead>("/tenant"), enabled: canManage });

  if (!canManage) return <NoAccess what="organization settings" />;
  return (
    <>
      <PageHeader title="Organization" description="Your organization's profile." />
      {tenant.isPending ? (
        <Skeleton className="h-64 max-w-xl" />
      ) : (
        tenant.data && (
          <div className="grid gap-4">
            <OrganizationForm tenant={tenant.data} />
            <SearchSettings tenant={tenant.data} />
          </div>
        )
      )}
    </>
  );
}
