"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ChoiceList } from "@/components/choice-list";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { ApiKeyCreated, ApiKeyRead } from "@/lib/api/types";
import { API_KEY_SCOPES, P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { formatDateTime, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

function keyStatus(k: ApiKeyRead): string {
  if (k.revoked_at) return "revoked";
  if (k.expires_at && new Date(k.expires_at) <= new Date()) return "expired";
  return "active";
}

/** A date input's value (local yyyy-mm-dd) for an ISO timestamp. */
function dateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const endOfDay = (date: string) => new Date(`${date}T23:59:59`).toISOString();

/** Create a key, or (with `editing`) change an existing key's name, scopes, expiry, limit and IPs. The secret
 *  never changes on edit. */
function KeyDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: ApiKeyRead | null }) {
  const queryClient = useQueryClient();
  const permissions = useAuth((s) => s.user?.permissions ?? []);
  const [name, setName] = useState(editing?.name ?? "");
  const [scopes, setScopes] = useState<string[]>(editing?.scopes ?? ["vendor:read"]);
  const [expires, setExpires] = useState(dateInput(editing?.expires_at));
  const [ips, setIps] = useState((editing?.ip_allowlist ?? []).join(", "));
  const [limit, setLimit] = useState(String(editing?.rate_limit_per_minute ?? 120));
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const fields = () => ({
    name: name.trim(),
    scopes,
    ip_allowlist: ips.split(/[\s,]+/).filter(Boolean),
    rate_limit_per_minute: Math.min(10000, Math.max(10, Math.round(Number(limit)) || 120)),
  });
  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        // The expiry is sent only when it changed (an already-passed date can't be saved again).
        const changed = expires !== dateInput(editing.expires_at);
        return api<ApiKeyRead>(`/api-keys/${editing.id}`, {
          method: "PATCH",
          body: { ...fields(), ...(changed ? { expires_at: expires ? endOfDay(expires) : null } : {}) },
        });
      }
      return api<ApiKeyCreated>("/api-keys", {
        method: "POST",
        body: { ...fields(), expires_at: expires ? endOfDay(expires) : null },
      });
    },
    onSuccess: (key) => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      if (editing) {
        toast.success("API key updated. The changes apply to its next request.");
        close();
      } else setCreated(key as ApiKeyCreated);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function close() {
    onOpenChange(false);
    setCreated(null);
    if (!editing) {
      setName("");
      setScopes(["vendor:read"]);
      setExpires("");
      setIps("");
      setLimit("120");
    }
  }

  const choices = API_KEY_SCOPES.map((s) => ({
    value: s.key,
    label: s.label,
    description: s.key,
    // A key can never carry more than its editor holds; the API enforces the same rule. A scope the key already
    // has stays removable.
    disabled: !permissions.includes(s.key) && !scopes.includes(s.key),
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      // The secret is shown exactly once: don't let a stray click outside throw it away. "Done" closes it.
      disablePointerDismissal={Boolean(created)}
    >
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new API key</DialogTitle>
              <DialogDescription>This is the only time it will be shown. Store it in a secret manager.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={created.key} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button
                size="icon"
                variant="outline"
                aria-label="Copy key"
                onClick={async () => {
                  await navigator.clipboard.writeText(created.key);
                  toast.success("Copied");
                }}
              >
                <Copy />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Send it as the <code>X-API-Key</code> header.
            </p>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit "${editing.name}"` : "Create API key"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Change what this key may do. The key itself stays the same, so systems using it need no change."
                  : "For integrations such as ERP or procurement systems."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField id="key-name" label="Name">
                <Input id="key-name" placeholder="e.g. SAP Ariba sync" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField id="key-scopes" label="Scopes">
                <ChoiceList idPrefix="scope" choices={choices} value={scopes} onChange={setScopes} />
              </FormField>
              <FormField id="key-expires" label="Expires on" hint="Optional. Leave empty for no expiry.">
                <Input id="key-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </FormField>
              <FormField id="key-limit" label="Requests per minute" hint="10–10,000. Requests over the limit get HTTP 429 with Retry-After.">
                <Input id="key-limit" type="number" min={10} max={10000} value={limit} onChange={(e) => setLimit(e.target.value)} />
              </FormField>
              <FormField id="key-ips" label="Allowed IPs / networks" hint="Optional, e.g. 203.0.113.0/24. Comma or space separated.">
                <Input id="key-ips" value={ips} onChange={(e) => setIps(e.target.value)} />
              </FormField>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button disabled={!name.trim() || !scopes.length || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : editing ? "Save changes" : "Create key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const canManage = useCan(P.APIKEY_MANAGE);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKeyRead | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRead | null>(null);
  const [deleting, setDeleting] = useState<ApiKeyRead | null>(null);

  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api<ApiKeyRead[]>("/api-keys"), enabled: canManage });
  const revoke = useMutation({
    mutationFn: (k: ApiKeyRead) => api(`/api-keys/${k.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("API key revoked");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setRevoking(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (k: ApiKeyRead) => api(`/api-keys/${k.id}`, { method: "DELETE", query: { permanent: true } }),
    onSuccess: () => {
      toast.success("API key deleted");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canManage) return <NoAccess what="API keys" />;

  return (
    <>
      <PageHeader
        title="API keys"
        description="Let other systems call the MasterAtlas API on behalf of your organization."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Create key
          </Button>
        }
      />
      {keys.data?.length === 0 ? (
        <Alert>
          <KeyRound />
          <AlertDescription>No API keys yet.</AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead className="text-right">Limit / min</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.isPending && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {keys.data?.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">mai_live_{k.prefix}_…</TableCell>
                  <TableCell className="max-w-72 min-w-48 text-xs whitespace-normal text-muted-foreground">{k.scopes.join(", ")}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{k.rate_limit_per_minute.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timeAgo(k.last_used_at)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{k.expires_at ? formatDateTime(k.expires_at) : "Never"}</TableCell>
                  <TableCell>
                    <StatusBadge status={keyStatus(k)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {!k.revoked_at && (
                        <>
                          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${k.name}`} title="Edit" onClick={() => setEditing(k)}>
                            <Pencil />
                          </Button>
                          <Button size="icon-sm" variant="ghost" aria-label={`Revoke ${k.name}`} title="Revoke" onClick={() => setRevoking(k)}>
                            <Ban />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Delete ${k.name}`}
                        title="Delete"
                        onClick={() => setDeleting(k)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <KeyDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing && <KeyDialog key={editing.id} open editing={editing} onOpenChange={(o) => !o && setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke "${revoking?.name}"?`}
        description="Any system using this key will immediately stop working. The key stays in this list as revoked. This can't be undone."
        confirmLabel="Revoke key"
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description={
          deleting?.revoked_at
            ? "The revoked key is removed from this list. The audit log keeps a record of it."
            : "Any system using this key will immediately stop working, and the key is removed from this list. The audit log keeps a record of it. This can't be undone."
        }
        confirmLabel="Delete key"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
