"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus } from "lucide-react";
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

function CreateKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const permissions = useAuth((s) => s.user?.permissions ?? []);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["vendor:read"]);
  const [expires, setExpires] = useState("");
  const [ips, setIps] = useState("");
  const [limit, setLimit] = useState("120");
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<ApiKeyCreated>("/api-keys", {
        method: "POST",
        body: {
          name: name.trim(),
          scopes,
          expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          ip_allowlist: ips.split(/[\s,]+/).filter(Boolean),
          rate_limit_per_minute: Math.min(10000, Math.max(10, Math.round(Number(limit)) || 120)),
        },
      }),
    onSuccess: (key) => {
      setCreated(key);
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function close() {
    onOpenChange(false);
    setCreated(null);
    setName("");
    setScopes(["vendor:read"]);
    setExpires("");
    setIps("");
    setLimit("120");
  }

  const choices = API_KEY_SCOPES.map((s) => ({
    value: s.key,
    label: s.label,
    description: s.key,
    // A key can never carry more than its creator holds; the API enforces the same rule.
    disabled: !permissions.includes(s.key),
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
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>For integrations such as ERP or procurement systems.</DialogDescription>
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
              <Button disabled={!name.trim() || !scopes.length || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creating…" : "Create key"}
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
  const [revoking, setRevoking] = useState<ApiKeyRead | null>(null);

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
        <div className="rounded-lg border">
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
                <TableHead className="w-24" />
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
                  <TableCell className="max-w-56 text-xs text-muted-foreground">{k.scopes.join(", ")}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{k.rate_limit_per_minute.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timeAgo(k.last_used_at)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{k.expires_at ? formatDateTime(k.expires_at) : "Never"}</TableCell>
                  <TableCell>
                    <StatusBadge status={keyStatus(k)} />
                  </TableCell>
                  <TableCell>
                    {!k.revoked_at && (
                      <Button size="sm" variant="destructive" onClick={() => setRevoking(k)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke "${revoking?.name}"?`}
        description="Any system using this key will immediately stop working. This can't be undone."
        confirmLabel="Revoke key"
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
      />
    </>
  );
}
