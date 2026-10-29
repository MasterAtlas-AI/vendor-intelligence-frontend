"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { AvlStatus, TenantOverlayRead, TenantOverlayUpdate, VendorDetail } from "@/lib/api/types";
import { errorMessage } from "@/lib/validation";
import { AVL_LABELS } from "@/lib/vendors";

/** Add a vendor to the organization's list, or edit its private fields (AVL status, code, tags, notes). */
export function OverlayDialog({
  vendor,
  open,
  onOpenChange,
}: {
  vendor: VendorDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const current = vendor.tenant;
  const [avl, setAvl] = useState<AvlStatus>(current?.avl_status ?? "unassessed");
  const [code, setCode] = useState(current?.internal_vendor_code ?? "");
  const [tags, setTags] = useState((current?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = `${vendor.id}:${current?.updated_at ?? "new"}`;
  if (open && openedFor !== key) {
    // Reload the fields each time the dialog opens, so it never shows stale edits.
    setOpenedFor(key);
    setAvl(current?.avl_status ?? "unassessed");
    setCode(current?.internal_vendor_code ?? "");
    setTags((current?.tags ?? []).join(", "));
    setNotes(current?.notes ?? "");
  }

  const save = useMutation({
    mutationFn: () => {
      const body: TenantOverlayUpdate = {
        avl_status: avl,
        internal_vendor_code: code.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes,
      };
      return api<TenantOverlayRead>(`/my-vendors/${vendor.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(current ? "Saved" : `${vendor.display_name} added to your list`);
      void queryClient.invalidateQueries({ queryKey: ["vendor", vendor.id] });
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current ? "Edit your vendor record" : "Add to my vendors"}</DialogTitle>
          <DialogDescription>Only people in your organization see these fields.</DialogDescription>
        </DialogHeader>
        <form
          id="overlay-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <FormField id="overlay-avl" label="Approval (AVL) status">
            <Select items={AVL_LABELS} value={avl} onValueChange={(v) => v && setAvl(v as AvlStatus)}>
              <SelectTrigger id="overlay-avl" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AVL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="overlay-code" label="Your vendor code" hint="E.g. the ERP / SAP supplier number">
            <Input id="overlay-code" maxLength={80} value={code} onChange={(e) => setCode(e.target.value)} />
          </FormField>
          <FormField id="overlay-tags" label="Tags" hint="Comma-separated">
            <Input id="overlay-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </FormField>
          <FormField id="overlay-notes" label="Notes">
            <Textarea id="overlay-notes" rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="overlay-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : current ? "Save" : "Add to my vendors"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
