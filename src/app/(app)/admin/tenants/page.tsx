"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { LoadMore } from "@/components/load-more";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { CursorPage, TenantAdminRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

const createSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, "3–63 lowercase letters, digits or hyphens"),
  plan: z.string().trim().min(1).max(50),
  admin_full_name: z.string().trim().min(1, "Required").max(200),
  admin_email: z.email("Enter a valid email"),
});
type CreateValues = z.infer<typeof createSchema>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function CreateTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", slug: "", plan: "starter", admin_full_name: "", admin_email: "" },
  });
  const create = useMutation({
    mutationFn: (v: CreateValues) =>
      api<TenantAdminRead>("/admin/tenants", {
        method: "POST",
        body: { name: v.name, slug: v.slug, plan: v.plan, admin: { email: v.admin_email, full_name: v.admin_full_name } },
      }),
    onSuccess: (t, v) => {
      toast.success(`${t.name} created. Invitation sent to ${v.admin_email}.`);
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New tenant</DialogTitle>
          <DialogDescription>Creates the organization and invites its first Tenant Admin.</DialogDescription>
        </DialogHeader>
        <form id="tenant-form" className="grid gap-4" noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <FormField id="t-name" label="Organization name" error={errors.name?.message}>
            <Input
              id="t-name"
              {...form.register("name", {
                onChange: (e) => {
                  if (!form.getFieldState("slug").isDirty) form.setValue("slug", slugify(e.target.value));
                },
              })}
            />
          </FormField>
          <FormField id="t-slug" label="Workspace ID" error={errors.slug?.message} hint="Permanent. Lowercase letters, digits, hyphens.">
            <Input id="t-slug" {...form.register("slug")} />
          </FormField>
          <FormField id="t-plan" label="Plan" error={errors.plan?.message}>
            <Input id="t-plan" {...form.register("plan")} />
          </FormField>
          <FormField id="t-admin-name" label="Admin's full name" error={errors.admin_full_name?.message}>
            <Input id="t-admin-name" {...form.register("admin_full_name")} />
          </FormField>
          <FormField id="t-admin-email" label="Admin's email" error={errors.admin_email?.message}>
            <Input id="t-admin-email" type="email" {...form.register("admin_email")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="tenant-form" disabled={create.isPending}>
            Create tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTenantDialog({ tenant, onClose }: { tenant: TenantAdminRead | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [forId, setForId] = useState<string | null>(null);
  if (tenant && forId !== tenant.id) {
    setForId(tenant.id);
    setPlan(tenant.plan);
    setTrusted(tenant.trusted_source);
  }
  const save = useMutation({
    mutationFn: () =>
      api<TenantAdminRead>(`/admin/tenants/${tenant!.id}`, {
        method: "PATCH",
        body: { plan: plan.trim(), trusted_source: trusted },
      }),
    onSuccess: () => {
      toast.success("Tenant updated");
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={Boolean(tenant)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tenant?.name}</DialogTitle>
          <DialogDescription>Platform-only settings for this tenant.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="e-plan" label="Plan">
            <Input id="e-plan" value={plan} onChange={(e) => setPlan(e.target.value)} />
          </FormField>
          <Label className="flex items-start gap-2.5 font-normal">
            <Checkbox aria-label="Trusted data source" className="mt-0.5" checked={trusted} onCheckedChange={(c) => setTrusted(Boolean(c))} />
            <span className="grid gap-0.5">
              <span className="font-medium">Trusted data source</span>
              <span className="text-xs text-muted-foreground">
                Vendors from this tenant&apos;s uploads may be added to the global knowledge base without curator review.
              </span>
            </span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!plan.trim() || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TenantsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useCan(P.TENANT_MANAGE);
  const setActAs = useAuth((s) => s.setActAs);
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim());
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TenantAdminRead | null>(null);
  const [suspending, setSuspending] = useState<TenantAdminRead | null>(null);

  const tenants = useInfiniteQuery({
    queryKey: ["tenants", search],
    queryFn: ({ pageParam, signal }) =>
      api<CursorPage<TenantAdminRead>>("/admin/tenants", {
        query: { q: search || undefined, limit: 25, cursor: pageParam },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: canManage,
  });

  const setStatus = useMutation({
    mutationFn: ({ t, action }: { t: TenantAdminRead; action: "suspend" | "activate" }) =>
      api<TenantAdminRead>(`/admin/tenants/${t.id}/${action}`, { method: "POST" }),
    onSuccess: (t) => {
      toast.success(`${t.name} is now ${t.status}`);
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setSuspending(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function viewAs(t: TenantAdminRead) {
    queryClient.clear(); // never mix one tenant's cached data with another's
    setActAs({ id: t.id, name: t.name });
    router.push("/dashboard");
  }

  if (!canManage) return <NoAccess what="tenant administration" />;
  const rows = tenants.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every organization on the platform."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Building2 /> New tenant
          </Button>
        }
      />
      <Input className="mb-4 max-w-xs" placeholder="Search name or workspace ID" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Trusted source</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {!tenants.isPending && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No tenants yet. Create the first one.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{t.slug}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-sm">{t.plan}</TableCell>
                <TableCell className="text-sm">{t.trusted_source ? "Yes" : "No"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateTime(t.created_at)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => viewAs(t)}>
                        <Eye /> View as this tenant
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditing(t)}>Edit plan & trust</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {t.status === "suspended" || t.status === "closed" ? (
                        <DropdownMenuItem onClick={() => setStatus.mutate({ t, action: "activate" })}>Activate</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem variant="destructive" onClick={() => setSuspending(t)}>
                          Suspend
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <LoadMore hasNextPage={tenants.hasNextPage} isFetchingNextPage={tenants.isFetchingNextPage} fetchNextPage={tenants.fetchNextPage} />

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditTenantDialog tenant={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(suspending)}
        onOpenChange={(o) => !o && setSuspending(null)}
        title={`Suspend ${suspending?.name}?`}
        description="All of its users are signed out immediately and can't sign in or use API keys until you activate it again."
        confirmLabel="Suspend tenant"
        destructive
        pending={setStatus.isPending}
        onConfirm={() => suspending && setStatus.mutate({ t: suspending, action: "suspend" })}
      />
    </>
  );
}
