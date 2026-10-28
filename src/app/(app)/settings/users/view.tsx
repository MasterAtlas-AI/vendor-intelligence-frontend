"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ChoiceList } from "@/components/choice-list";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { LoadMore } from "@/components/load-more";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounced } from "@/hooks/use-debounced";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { CursorPage, RoleRead, UserRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

const STATUS_FILTERS = { all: "All statuses", active: "Active", invited: "Invited", disabled: "Disabled" };

function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => api<RoleRead[]>("/roles"), staleTime: 5 * 60_000 });
}

function roleChoices(roles: RoleRead[] | undefined) {
  return (roles ?? []).map((r) => ({
    value: r.key,
    label: r.name,
    description: `${r.permissions.length} permissions`,
  }));
}

// ---------------------------------------------------------------- invite

const inviteSchema = z.object({
  email: z.email("Enter a valid email"),
  full_name: z.string().trim().min(1, "Required").max(200),
  roles: z.array(z.string()).min(1, "Pick at least one role"),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const roles = useRoles();
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", full_name: "", roles: ["engineer"] },
  });

  const invite = useMutation({
    mutationFn: (values: InviteValues) => api<UserRead>("/users/invite", { method: "POST", body: values }),
    onSuccess: (user) => {
      toast.success(`Invitation sent to ${user.email}`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link to set their password (valid 72 hours).</DialogDescription>
        </DialogHeader>
        <form id="invite-form" className="grid gap-4" noValidate onSubmit={form.handleSubmit((v) => invite.mutate(v))}>
          <FormField id="invite-email" label="Email" error={form.formState.errors.email?.message}>
            <Input id="invite-email" type="email" {...form.register("email")} />
          </FormField>
          <FormField id="invite-name" label="Full name" error={form.formState.errors.full_name?.message}>
            <Input id="invite-name" {...form.register("full_name")} />
          </FormField>
          <FormField id="invite-roles" label="Roles" error={form.formState.errors.roles?.message}>
            {roles.isPending ? (
              <Skeleton className="h-24" />
            ) : (
              <Controller
                control={form.control}
                name="roles"
                render={({ field }) => (
                  <ChoiceList idPrefix="invite-role" choices={roleChoices(roles.data)} value={field.value} onChange={field.onChange} />
                )}
              />
            )}
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- roles

function RolesDialog({ user, onClose }: { user: UserRead | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const roles = useRoles();
  const [selected, setSelected] = useState<string[]>([]);
  const [forUser, setForUser] = useState<string | null>(null);
  if (user && forUser !== user.id) {
    // Reset the selection whenever a different user is opened (dialogs stay mounted between uses).
    setForUser(user.id);
    setSelected(user.roles);
  }

  const save = useMutation({
    mutationFn: () => api<UserRead>(`/users/${user!.id}/roles`, { method: "PUT", body: { roles: selected } }),
    onSuccess: (u) => {
      toast.success(`Roles updated for ${u.full_name}`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Roles for {user?.full_name}</DialogTitle>
          <DialogDescription>Changes apply on their next request.</DialogDescription>
        </DialogHeader>
        <ChoiceList idPrefix="edit-role" choices={roleChoices(roles.data)} value={selected} onChange={setSelected} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!selected.length || save.isPending} onClick={() => save.mutate()}>
            Save roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- page

export default function UsersPage() {
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const canRead = useCan(P.USER_READ);
  const canManage = useCan(P.USER_MANAGE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<keyof typeof STATUS_FILTERS>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRead | null>(null);
  const [toggling, setToggling] = useState<UserRead | null>(null);

  const search = useDebounced(q.trim());
  const users = useInfiniteQuery({
    queryKey: ["users", search, status],
    queryFn: ({ pageParam, signal }) =>
      api<CursorPage<UserRead>>("/users", {
        query: { q: search || undefined, status: status === "all" ? undefined : status, limit: 25, cursor: pageParam },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: canRead,
  });

  const toggle = useMutation({
    mutationFn: (u: UserRead) =>
      api<UserRead>(`/users/${u.id}/${u.status === "disabled" ? "enable" : "disable"}`, { method: "POST" }),
    onSuccess: (u) => {
      toast.success(`${u.full_name} is now ${u.status}`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      setToggling(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canRead) return <NoAccess what="user management" />;
  const rows = users.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Everyone in your organization and what they can do."
        actions={
          canManage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite user
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search name or email"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select items={STATUS_FILTERS} value={status} onValueChange={(v) => setStatus((v ?? "all") as typeof status)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_FILTERS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isPending &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              ))}
            {!users.isPending && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No users match.
                </TableCell>
              </TableRow>
            )}
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.full_name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell className="text-sm">{u.roles.map(humanize).join(", ") || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={u.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{timeAgo(u.last_login_at)}</TableCell>
                <TableCell>
                  {canManage && u.id !== me.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(u)}>Change roles</DropdownMenuItem>
                        {u.status !== "invited" && (
                          <DropdownMenuItem
                            variant={u.status === "disabled" ? "default" : "destructive"}
                            onClick={() => setToggling(u)}
                          >
                            {u.status === "disabled" ? "Enable user" : "Disable user"}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <LoadMore
        hasNextPage={users.hasNextPage}
        isFetchingNextPage={users.isFetchingNextPage}
        fetchNextPage={users.fetchNextPage}
      />

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <RolesDialog user={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.status === "disabled" ? `Enable ${toggling?.full_name}?` : `Disable ${toggling?.full_name}?`}
        description={
          toggling?.status === "disabled"
            ? "They will be able to sign in again."
            : "They will be signed out everywhere and can't sign in until re-enabled."
        }
        confirmLabel={toggling?.status === "disabled" ? "Enable" : "Disable"}
        destructive={toggling?.status !== "disabled"}
        pending={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
      />
    </>
  );
}
