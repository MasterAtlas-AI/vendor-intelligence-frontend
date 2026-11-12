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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { AiControls, TenantRead } from "@/lib/api/types";
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

function parseDomains(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

function AiSettings({ tenant }: { tenant: TenantRead }) {
  const queryClient = useQueryClient();
  const [sharePrivate, setSharePrivate] = useState(tenant.ai.share_private_data);
  const [webSources, setWebSources] = useState<AiControls["web_sources"]>(tenant.ai.web_sources);
  const [domains, setDomains] = useState((tenant.ai.approved_domains ?? []).join("\n"));
  const next: AiControls = {
    share_private_data: sharePrivate,
    web_sources: webSources,
    approved_domains: parseDomains(domains),
  };
  const dirty =
    next.share_private_data !== tenant.ai.share_private_data ||
    next.web_sources !== tenant.ai.web_sources ||
    next.approved_domains!.join("\n") !== (tenant.ai.approved_domains ?? []).join("\n");

  const save = useMutation({
    mutationFn: () => api<TenantRead>("/tenant", { method: "PATCH", body: { ai: next } }),
    onSuccess: (t) => {
      queryClient.setQueryData(["tenant", "own"], t);
      // Show the domains as the server normalized them (e.g. "https://www.example.com/x" -> "example.com").
      setDomains((t.ai.approved_domains ?? []).join("\n"));
      toast.success("AI settings saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const approvedOnlyWithoutDomains = webSources === "approved_only" && next.approved_domains!.length === 0;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>AI &amp; sources</CardTitle>
        <CardDescription>What the AI assistant may see and where it may look on the web.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Label className="flex items-start gap-2.5 font-normal">
          <Checkbox
            aria-label="Allow the organization's own data in AI prompts"
            className="mt-0.5"
            checked={sharePrivate}
            disabled={save.isPending}
            onCheckedChange={(c) => setSharePrivate(Boolean(c))}
          />
          <span className="grid gap-0.5">
            <span className="font-medium">
              Allow the organization&apos;s own data (AVL status, tags, project history) in AI prompts
            </span>
            <span className="text-xs text-muted-foreground">
              Off by default. When off, answers use the shared knowledge base and the public web only; your history is
              matched on the server and shown beside the answer, without being sent to the AI provider.
            </span>
          </span>
        </Label>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Web searches</legend>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="web-sources"
              className="mt-1"
              checked={webSources === "open"}
              disabled={save.isPending}
              onChange={() => setWebSources("open")}
            />
            <span>Any public site</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="web-sources"
              className="mt-1"
              checked={webSources === "approved_only"}
              disabled={save.isPending}
              onChange={() => setWebSources("approved_only")}
            />
            <span>Approved sources only</span>
          </label>
        </fieldset>

        <FormField
          id="ai-domains"
          label="Approved sources"
          hint={
            approvedOnlyWithoutDomains
              ? "No domains listed yet, so web searches are not limited until you add some."
              : "One website domain per line, e.g. api.org or vendor.com. Full addresses are reduced to the site's domain."
          }
        >
          <Textarea
            id="ai-domains"
            rows={5}
            className="font-mono text-xs"
            placeholder={"api.org\nasme.org"}
            value={domains}
            disabled={save.isPending}
            onChange={(e) => setDomains(e.target.value)}
          />
        </FormField>
        {save.isError && (
          <p role="alert" className="text-xs text-destructive">
            {errorMessage(save.error)}
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => {
              setSharePrivate(tenant.ai.share_private_data);
              setWebSources(tenant.ai.web_sources);
              setDomains((tenant.ai.approved_domains ?? []).join("\n"));
              save.reset();
            }}
          >
            Discard changes
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default function OrganizationPage() {
  const canManage = useCan(P.TENANT_SETTINGS_MANAGE);
  const tenant = useQuery({ queryKey: ["tenant", "own"], queryFn: () => api<TenantRead>("/tenant"), enabled: canManage });

  if (!canManage) return <NoAccess what="organization settings" />;
  return (
    <>
      <PageHeader title="Organization" description="Your organization's profile, search and AI settings." />
      {tenant.isPending ? (
        <Skeleton className="h-64 max-w-xl" />
      ) : (
        tenant.data && (
          <div className="grid gap-4">
            <OrganizationForm tenant={tenant.data} />
            <SearchSettings tenant={tenant.data} />
            <AiSettings tenant={tenant.data} />
          </div>
        )
      )}
    </>
  );
}
