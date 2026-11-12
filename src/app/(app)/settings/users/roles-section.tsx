"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ChoiceList } from "@/components/choice-list";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api/client";
import type { PermissionRead, RoleRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/validation";

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => api<RoleRead[]>("/roles"), staleTime: 5 * 60_000 });
}

function usePermissions() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<PermissionRead[]>("/permissions"),
    staleTime: 30 * 60_000,
  });
}

function RoleDialog({ role, onClose }: { role: RoleRead | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);

  const assignable = (permissions.data ?? []).filter((p) => p.assignable);
  const assignableKeys = new Set(assignable.map((p) => p.key));
  const chosen = selected.filter((k) => assignableKeys.has(k));
  const choices = assignable.map((p) => ({ value: p.key, label: p.description || p.key, description: p.key }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        // Only send what the picker can show, so a stale non-assignable permission can't block the save.
        permissions: chosen,
      };
      return role
        ? api<RoleRead>(`/roles/${role.id}`, { method: "PATCH", body })
        : api<RoleRead>("/roles", { method: "POST", body });
    },
    onSuccess: (r) => {
      toast.success(role ? `${r.name} updated` : `${r.name} created`);
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New custom role"}</DialogTitle>
          <DialogDescription>
            {role && role.user_count > 0
              ? `Changes apply to the ${role.user_count} user${role.user_count === 1 ? "" : "s"} holding this role on their next request.`
              : "Pick what people with this role can do. Assign it to users from the users list."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <FormField id="role-name" label="Name">
            <Input id="role-name" placeholder="e.g. Site Engineer" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="role-description" label="Description" hint="Optional.">
            <Textarea id="role-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField id="role-permissions" label={`Permissions (${chosen.length} chosen)`}>
            {permissions.isPending ? (
              <Skeleton className="h-40" />
            ) : permissions.isError ? (
              <p className="text-sm text-destructive">{errorMessage(permissions.error)}</p>
            ) : (
              <ChoiceList idPrefix="role-perm" choices={choices} value={selected} onChange={setSelected} />
            )}
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={name.trim().length < 2 || !chosen.length || save.isPending || !permissions.data} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : role ? "Save role" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleRow({
  role,
  descriptions,
  canManage,
  onEdit,
  onDelete,
}: {
  role: RoleRead;
  descriptions: Record<string, string>;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-expanded={open}
          aria-label={open ? `Hide permissions of ${role.name}` : `Show permissions of ${role.name}`}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        </button>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{role.name}</span>
            <Badge variant={role.is_system ? "outline" : "secondary"}>{role.is_system ? "Built-in" : "Custom"}</Badge>
          </div>
          {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
          <p className="text-xs text-muted-foreground">
            {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"} · {role.user_count} user
            {role.user_count === 1 ? "" : "s"}
          </p>
        </div>
        {canManage && !role.is_system && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${role.name}`} onClick={onEdit}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${role.name}`} onClick={onDelete}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      {open && (
        <ul className="grid gap-1 px-10 pb-3 text-sm">
          {role.permissions.length === 0 && <li className="text-muted-foreground">No permissions.</li>}
          {role.permissions.map((key) => (
            <li key={key}>
              {descriptions[key] ?? key} <span className="font-mono text-xs text-muted-foreground">{key}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Built-in roles (read-only) and the organization's custom roles (role:manage). */
export function RolesSection() {
  const queryClient = useQueryClient();
  const canManage = useCan(P.ROLE_MANAGE);
  const roles = useRoles();
  const permissions = usePermissions();
  const [dialog, setDialog] = useState<{ role: RoleRead | null } | null>(null);
  const [deleting, setDeleting] = useState<RoleRead | null>(null);

  const remove = useMutation({
    mutationFn: (r: RoleRead) => api(`/roles/${r.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Role deleted");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(
        e instanceof ApiError && e.status === 409
          ? "Users still hold this role. Give them another role first, then delete it."
          : errorMessage(e),
      );
    },
  });

  const descriptions = Object.fromEntries((permissions.data ?? []).map((p) => [p.key, p.description]));
  const custom = (roles.data ?? []).filter((r) => !r.is_system);
  const system = (roles.data ?? []).filter((r) => r.is_system);

  return (
    <section className="mt-10 grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Roles</h2>
          <p className="text-sm text-muted-foreground">
            Built-in roles cover each department; add custom roles when someone needs a different mix of permissions.
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setDialog({ role: null })}>
            <Plus /> New role
          </Button>
        )}
      </div>
      {roles.isPending && <Skeleton className="h-40" />}
      {roles.isError && <p className="text-sm text-destructive">{errorMessage(roles.error)}</p>}
      {roles.data && (
        <>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Custom roles</h3>
            {custom.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No custom roles yet.
              </div>
            ) : (
              <ul className="rounded-lg border">
                {custom.map((r) => (
                  <RoleRow
                    key={r.id}
                    role={r}
                    descriptions={descriptions}
                    canManage={canManage}
                    onEdit={() => setDialog({ role: r })}
                    onDelete={() => setDeleting(r)}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Built-in roles</h3>
            <ul className="rounded-lg border">
              {system.map((r) => (
                <RoleRow key={r.id} role={r} descriptions={descriptions} canManage={false} onEdit={() => {}} onDelete={() => {}} />
              ))}
            </ul>
          </div>
        </>
      )}

      {dialog && <RoleDialog key={dialog.role?.id ?? "new"} role={dialog.role} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={
          deleting && deleting.user_count > 0
            ? `${deleting.user_count} user${deleting.user_count === 1 ? " still holds" : "s still hold"} this role, so it can't be deleted yet. Give them another role first.`
            : "This can't be undone."
        }
        confirmLabel="Delete role"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </section>
  );
}
