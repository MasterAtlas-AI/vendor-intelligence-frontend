"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Copy, MoreHorizontal, Plus, Webhook } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { WebhookDelivery, WebhookEndpoint, WebhookEndpointWithSecret } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { formatDateTime, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

const EVENTS = [
  { value: "vendor.updated", label: "Vendor updated", description: "Approved changes to a vendor on your list." },
  { value: "proposal.approved", label: "Proposal approved", description: "A change your organization proposed was approved." },
  { value: "job.completed", label: "Job completed", description: "Imports, AI discovery runs and reports that finish." },
];

const DOCS_URL = "/api/v1/docs";

/** The signing secret is shown once, after creating an endpoint or rotating its secret. */
function SecretDialog({ endpoint, onClose }: { endpoint: WebhookEndpointWithSecret | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(endpoint)} onOpenChange={(o) => !o && onClose()} disablePointerDismissal>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy the signing secret</DialogTitle>
          <DialogDescription>This is the only time it will be shown. Your server uses it to check each delivery.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={endpoint?.secret ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button
            size="icon"
            variant="outline"
            aria-label="Copy secret"
            onClick={async () => {
              await navigator.clipboard.writeText(endpoint?.secret ?? "");
              toast.success("Copied");
            }}
          >
            <Copy />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Each request carries <code>MasterAtlas-Signature: t=…,v1=…</code>, where v1 is HMAC-SHA256 of{" "}
          <code>{"<t>.<raw body>"}</code> with this secret. Reject timestamps older than 5 minutes.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EndpointDialog({
  open,
  editing,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  editing: WebhookEndpoint | null;
  onOpenChange: (o: boolean) => void;
  onCreated: (ep: WebhookEndpointWithSecret) => void;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(editing?.url ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [events, setEvents] = useState<string[]>(editing?.events ?? ["job.completed"]);
  const https = url.trim().toLowerCase().startsWith("https://");

  const save = useMutation({
    mutationFn: () => {
      const body = { url: url.trim(), description: description.trim(), events };
      return editing
        ? api<WebhookEndpoint>(`/webhooks/${editing.id}`, { method: "PATCH", body })
        : api<WebhookEndpointWithSecret>("/webhooks", { method: "POST", body });
    },
    onSuccess: (ep) => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      onOpenChange(false);
      if (editing) toast.success("Webhook updated");
      else onCreated(ep as WebhookEndpointWithSecret);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit webhook" : "Add webhook"}</DialogTitle>
          <DialogDescription>MasterAtlas sends a signed POST request to this address when the events happen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField
            id="hook-url"
            label="Endpoint URL"
            hint="Must use https:// and be reachable from the internet."
            error={url.trim() && !https ? "Use an https:// address." : undefined}
          >
            <Input id="hook-url" placeholder="https://erp.example.com/hooks/masteratlas" value={url} onChange={(e) => setUrl(e.target.value)} />
          </FormField>
          <FormField id="hook-description" label="Description" hint="Optional.">
            <Input id="hook-description" placeholder="e.g. ERP vendor sync" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField id="hook-events" label="Events">
            <ChoiceList idPrefix="event" choices={EVENTS} value={events} onChange={setEvents} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!https || !events.length || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : editing ? "Save" : "Add webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesDialog({ endpoint, onClose }: { endpoint: WebhookEndpoint | null; onClose: () => void }) {
  const deliveries = useQuery({
    queryKey: ["webhooks", endpoint?.id, "deliveries"],
    queryFn: () => api<WebhookDelivery[]>(`/webhooks/${endpoint?.id}/deliveries`),
    enabled: Boolean(endpoint),
    refetchInterval: 5000,
  });

  return (
    <Dialog open={Boolean(endpoint)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recent deliveries</DialogTitle>
          <DialogDescription className="break-all">{endpoint?.url}</DialogDescription>
        </DialogHeader>
        {deliveries.isPending && <Skeleton className="h-32" />}
        {deliveries.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing sent yet. Use “Send test event” to try it.</p>}
        {Boolean(deliveries.data?.length) && (
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.data?.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.event}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                      {d.status === "pending" && d.attempts > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">Retry {timeAgo(d.next_attempt_at)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.attempts}</TableCell>
                    <TableCell className="max-w-64 text-xs text-muted-foreground">
                      {d.error ?? (d.response_status ? `HTTP ${d.response_status}` : "—")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" title={formatDateTime(d.created_at)}>
                      {timeAgo(d.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const canManage = useCan(P.APIKEY_MANAGE);
  const [dialog, setDialog] = useState<{ editing: WebhookEndpoint | null } | null>(null);
  const [secret, setSecret] = useState<WebhookEndpointWithSecret | null>(null);
  const [viewing, setViewing] = useState<WebhookEndpoint | null>(null);
  const [rotating, setRotating] = useState<WebhookEndpoint | null>(null);
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);

  const hooks = useQuery({ queryKey: ["webhooks"], queryFn: () => api<WebhookEndpoint[]>("/webhooks"), enabled: canManage });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["webhooks"] });

  const toggle = useMutation({
    mutationFn: (ep: WebhookEndpoint) => api(`/webhooks/${ep.id}`, { method: "PATCH", body: { active: !ep.active } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const test = useMutation({
    mutationFn: (ep: WebhookEndpoint) => api(`/webhooks/${ep.id}/test`, { method: "POST" }),
    onSuccess: (_, ep) => {
      toast.success("Test event queued");
      setViewing(ep);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rotate = useMutation({
    mutationFn: (ep: WebhookEndpoint) => api<WebhookEndpointWithSecret>(`/webhooks/${ep.id}/rotate-secret`, { method: "POST" }),
    onSuccess: (ep) => {
      setRotating(null);
      setSecret(ep);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (ep: WebhookEndpoint) => api(`/webhooks/${ep.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Webhook deleted");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canManage) return <NoAccess what="webhooks" />;

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Tell your systems when vendors change, proposals are approved or jobs finish."
        actions={
          <>
            <Button variant="outline" render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}>
              <BookOpen /> API documentation
            </Button>
            <Button onClick={() => setDialog({ editing: null })}>
              <Plus /> Add webhook
            </Button>
          </>
        }
      />
      {hooks.isError && <p className="text-sm text-destructive">{errorMessage(hooks.error)}</p>}
      {hooks.data?.length === 0 ? (
        <Alert>
          <Webhook />
          <AlertDescription>No webhooks yet. Failed deliveries are retried for about 9 hours.</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last delivery</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {hooks.isPending && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {hooks.data?.map((ep) => (
                <TableRow key={ep.id}>
                  <TableCell className="max-w-80">
                    <div className="truncate font-mono text-xs" title={ep.url}>
                      {ep.url}
                    </div>
                    {ep.description && <div className="text-xs text-muted-foreground">{ep.description}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{ep.events.join(", ")}</TableCell>
                  <TableCell>
                    <StatusBadge status={ep.active ? "active" : "disabled"} />
                    {ep.disabled_reason && <div className="mt-1 max-w-48 text-xs text-muted-foreground">{ep.disabled_reason}</div>}
                    {ep.active && ep.failure_count > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">{ep.failure_count} failed in a row</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ep.last_delivery_at ? (
                      <>
                        {timeAgo(ep.last_delivery_at)}
                        {ep.last_status ? ` · HTTP ${ep.last_status}` : " · no response"}
                      </>
                    ) : (
                      "Never"
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewing(ep)}>Recent deliveries</DropdownMenuItem>
                        <DropdownMenuItem disabled={!ep.active} onClick={() => test.mutate(ep)}>
                          Send test event
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDialog({ editing: ep })}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggle.mutate(ep)}>{ep.active ? "Switch off" : "Switch on"}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRotating(ep)}>Rotate secret</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(ep)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog && (
        <EndpointDialog
          key={dialog.editing?.id ?? "new"}
          open
          editing={dialog.editing}
          onOpenChange={(o) => !o && setDialog(null)}
          onCreated={setSecret}
        />
      )}
      <SecretDialog endpoint={secret} onClose={() => setSecret(null)} />
      <DeliveriesDialog endpoint={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={Boolean(rotating)}
        onOpenChange={(o) => !o && setRotating(null)}
        title="Rotate the signing secret?"
        description="The old secret stops working at once. Update your server with the new one."
        confirmLabel="Rotate secret"
        pending={rotate.isPending}
        onConfirm={() => rotating && rotate.mutate(rotating)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this webhook?"
        description="Deliveries waiting to be sent are dropped. This can't be undone."
        confirmLabel="Delete webhook"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
