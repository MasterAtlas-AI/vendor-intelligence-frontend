"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, download } from "@/lib/api/client";
import type { VendorDetail, VendorDocument } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

const countries = (codes: (string | null | undefined)[]) =>
  [...new Set(codes.filter((c): c is string => Boolean(c)))].map(countryName).sort().join(", ");

/** SOW 5.25: what the vendor can make, and where its factories are. Curators can propose a change (reviewed). */
export function ManufacturingCapability({ vendor }: { vendor: VendorDetail }) {
  const canCurate = useCan(P.KNOWLEDGE_APPROVE);
  const [editing, setEditing] = useState(false);
  const factories = countries(vendor.locations.filter((l) => l.location_type === "factory").map((l) => l.country));
  return (
    <div className="grid gap-1">
      <div className="flex items-start gap-1">
        <span className={vendor.manufacturing_capability ? "whitespace-pre-wrap" : "text-muted-foreground"}>
          {vendor.manufacturing_capability || "Not recorded"}
        </span>
        {canCurate && (
          <Button size="icon-xs" variant="ghost" aria-label="Edit manufacturing capability" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        )}
      </div>
      {factories && <span className="text-xs text-muted-foreground">Factories: {factories}</span>}
      {editing && <CapabilityDialog vendor={vendor} onClose={() => setEditing(false)} />}
    </div>
  );
}

function CapabilityDialog({ vendor, onClose }: { vendor: VendorDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(vendor.manufacturing_capability ?? "");
  const save = useMutation({
    mutationFn: () =>
      api("/admin/proposals", {
        method: "POST",
        body: {
          kind: "update_vendor",
          subject_vendor_id: vendor.id,
          title: `Manufacturing capability for ${vendor.display_name}`,
          items: [
            {
              action: "update_vendor_field",
              payload: { field: "manufacturing_capability", value: text.trim() || null },
              evidence: [{ kind: "manual", title: "Entered by a curator" }],
              confidence: null,
            },
          ],
        },
      }),
    onSuccess: () => {
      toast.success("Sent for review. It shows here once approved.");
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manufacturing capability</DialogTitle>
          <DialogDescription>
            What {vendor.display_name} makes in-house: processes, size and weight limits, test facilities. The change goes to the review queue like any other knowledge.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="mfg-capability">Capability</Label>
          <Textarea
            id="mfg-capability"
            rows={6}
            maxLength={5000}
            placeholder="e.g. Casting and machining in-house up to 12 t; hydrostatic and performance test bed to 4 MW; duplex and super duplex welding."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending || text.trim() === (vendor.manufacturing_capability ?? "")} onClick={() => save.mutate()}>
            {save.isPending ? "Sending…" : "Send for review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** SOW 5.23: where the vendor can support you - service centres, and the regions its services cover. */
export function SupportNetwork({ vendor }: { vendor: VendorDetail }) {
  const centres = countries(vendor.locations.filter((l) => l.location_type === "service_center").map((l) => l.country));
  const regions = [...new Set(vendor.services.flatMap((s) => s.regions))].sort();
  if (!centres && regions.length === 0) return <span className="text-muted-foreground">None recorded</span>;
  return (
    <div className="grid gap-1">
      {centres && <span>Service centres: {centres}</span>}
      {regions.length > 0 && <span className="text-xs text-muted-foreground">Services cover: {regions.join(", ")}</span>}
    </div>
  );
}

const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** SOW 17.3: the documents your organization uploaded that this vendor's facts came from (private to you). */
export function VendorDocuments({ vendorId }: { vendorId: string }) {
  const docs = useQuery({
    queryKey: ["vendor-documents", vendorId],
    queryFn: () => api<VendorDocument[]>(`/vendors/${vendorId}/documents`),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source documents</CardTitle>
        <CardDescription>Files your organization uploaded that facts on this vendor came from. Only your organization sees them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {docs.isPending && <Skeleton className="h-10" />}
        {docs.isError && <p className="text-destructive">{errorMessage(docs.error)}</p>}
        {docs.data?.length === 0 && <p className="text-muted-foreground">None. Documents you import on the Imports page appear here.</p>}
        {docs.data?.map((d) => (
          <div key={d.upload_id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" title={d.filename}>
                {d.filename}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.facts} fact{d.facts === 1 ? "" : "s"} · {size(d.size_bytes)} · {timeAgo(d.uploaded_at)}
              </div>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Download ${d.filename}`}
              onClick={() => void download(`/vendors/${vendorId}/documents/${d.upload_id}`, d.filename).catch((e: unknown) => toast.error(errorMessage(e)))}
            >
              <Download />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
