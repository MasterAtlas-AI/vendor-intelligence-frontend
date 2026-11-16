"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime, humanize } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

type Preview = components["schemas"]["EmailPreview"];
type Result = components["schemas"]["EmailSendResult"];

/** E-mail the RFQ to its vendors: preview the message, tick who gets it, add a note, send (or a test copy to me). */
export function EmailRfqDialog({
  rfqId,
  only,
  onClose,
  onSent,
}: {
  rfqId: string;
  only?: string; // open with just this vendor ticked (the row's own e-mail button)
  onClose: () => void;
  onSent: () => void;
}) {
  const preview = useQuery({ queryKey: ["rfq-email", rfqId], queryFn: () => api<Preview>(`/rfqs/${rfqId}/email`) });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [note, setNote] = useState("");
  const p = preview.data;
  const withEmail = (p?.recipients ?? []).filter((r) => r.email);
  // By default: everyone with an address who hasn't been e-mailed yet.
  const chosen =
    picked ?? new Set(only ? withEmail.filter((r) => r.vendor_id === only).map((r) => r.vendor_id) : withEmail.filter((r) => !r.emailed_at).map((r) => r.vendor_id));

  const send = useMutation({
    mutationFn: (testToMe: boolean) =>
      api<Result>(`/rfqs/${rfqId}/email`, {
        method: "POST",
        // A test copy still names one vendor (for the greeting): the first ticked, or the first on the RFQ.
        body: { vendor_ids: testToMe ? [[...chosen][0] ?? p?.recipients[0]?.vendor_id].filter(Boolean) : [...chosen], note, test_to_me: testToMe },
      }),
    onSuccess: (r, testToMe) => {
      if (r.failed.length) toast.error(`Not sent: ${r.failed.join("; ")}`);
      if (testToMe) {
        if (r.sent.length) toast.success(`Test copy sent to ${r.sent[0]}`);
        return;
      }
      if (r.sent.length) {
        toast.success(`RFQ e-mailed to ${r.sent.length} vendor${r.sent.length === 1 ? "" : "s"}${r.issued ? " and issued" : ""}`);
        onSent();
        onClose();
      }
      if (r.skipped.length) toast.warning(`Skipped: ${r.skipped.join("; ")}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>E-mail the RFQ to vendors</DialogTitle>
          <DialogDescription>
            Each vendor gets its own e-mail with the RFQ details and requirements; no vendor sees the others. Their replies come to you.
          </DialogDescription>
        </DialogHeader>
        {preview.isPending && <Skeleton className="h-64" />}
        {preview.isError && <p className="text-sm text-destructive">{errorMessage(preview.error)}</p>}
        {p && (
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
            {!p.configured && (
              <Alert>
                <Mail />
                <AlertDescription>
                  E-mail isn&apos;t set up on this server yet, so messages are only written to the server log, not delivered. Add the SMTP settings to turn
                  sending on.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-1 text-sm">
              <div>
                <span className="text-muted-foreground">From:</span> {p.sender}
              </div>
              <div>
                <span className="text-muted-foreground">Replies to:</span> {p.reply_to ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Subject:</span> <span className="font-medium">{p.subject}</span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Send to</Label>
              <div className="grid gap-1 rounded-md border p-2">
                {p.recipients.length === 0 && <p className="text-sm text-muted-foreground">Add vendors to the RFQ first.</p>}
                {p.recipients.map((r) => (
                  <Label key={r.vendor_id} className={`flex items-start gap-2 font-normal ${r.email ? "" : "opacity-60"}`}>
                    <Checkbox
                      className="mt-0.5"
                      disabled={!r.email}
                      checked={chosen.has(r.vendor_id)}
                      onCheckedChange={(c) => {
                        const next = new Set(chosen);
                        if (c) next.add(r.vendor_id);
                        else next.delete(r.vendor_id);
                        setPicked(next);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">· {humanize(r.status)}</span>
                      <span className="block text-xs break-all text-muted-foreground">
                        {r.email ?? "No e-mail address on record: add one on the vendor's page"}
                        {r.test_address && (
                          <span className="ml-1 rounded bg-amber-500/15 px-1 text-amber-800 dark:text-amber-300">test address: the vendor has no e-mail</span>
                        )}
                        {r.emailed_at && ` · already e-mailed ${formatDateTime(r.emailed_at)}`}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rfq-note">Personal note (optional)</Label>
              <Textarea id="rfq-note" rows={3} placeholder="Added above the RFQ details, e.g. a deadline reminder or a contact person." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Message</Label>
              <pre className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 font-sans text-xs whitespace-pre-wrap">
                {p.body.replace("<vendor name>", "[vendor name]").replace(/(Dear \[vendor name\],\n\n)/, note.trim() ? `$1${note.trim()}\n\n` : "$1")}
              </pre>
            </div>
          </div>
        )}
        <DialogFooter className="items-center">
          <Button variant="outline" className="mr-auto" disabled={!p || send.isPending || !p.reply_to || p.recipients.length === 0} onClick={() => send.mutate(true)}>
            Send me a test copy
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!p || chosen.size === 0 || send.isPending} onClick={() => send.mutate(false)}>
            <Send /> {send.isPending ? "Sending…" : `Send to ${chosen.size} vendor${chosen.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
