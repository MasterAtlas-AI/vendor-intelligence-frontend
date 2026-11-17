"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmailRfqDialog } from "@/components/rfqs/email-rfq-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import type { Rfq, SearchIntent } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/validation";

const OPEN = new Set(["draft", "issued", "evaluating"]);
const NEW = "new";

/**
 * "RFQ" for one vendor from the assistant: pick an open RFQ (or start one from the question), the vendor is added to
 * it, then the usual e-mail preview opens with just this vendor ticked, ready to send.
 */
export function VendorRfqButton({
  vendor,
  question,
  requirement,
  size = "xs",
  className,
}: {
  vendor: { vendor_id: string; name: string };
  question: string;
  requirement?: SearchIntent | null;
  size?: "xs" | "sm";
  className?: string;
}) {
  const canRfq = useCan(P.RFQ_MANAGE);
  const [step, setStep] = useState<"closed" | "pick" | "email">("closed");
  const [rfqId, setRfqId] = useState<string | null>(null);
  if (!canRfq) return null;
  return (
    <>
      <Button
        variant="outline"
        size={size}
        className={className}
        title={`Send an RFQ to ${vendor.name} by e-mail`}
        onClick={(e) => {
          e.stopPropagation();
          setStep("pick");
        }}
      >
        <Mail /> RFQ
      </Button>
      {step === "pick" && (
        <PickRfq
          vendor={vendor}
          question={question}
          requirement={requirement}
          onClose={() => setStep("closed")}
          onReady={(id) => {
            setRfqId(id);
            setStep("email");
          }}
        />
      )}
      {step === "email" && rfqId && <EmailRfqDialog rfqId={rfqId} only={vendor.vendor_id} onClose={() => setStep("closed")} onSent={() => undefined} />}
    </>
  );
}

function PickRfq({
  vendor,
  question,
  requirement,
  onClose,
  onReady,
}: {
  vendor: { vendor_id: string; name: string };
  question: string;
  requirement?: SearchIntent | null;
  onClose: () => void;
  onReady: (rfqId: string) => void;
}) {
  const qc = useQueryClient();
  const actAs = useAuth((s) => s.actAs);
  const rfqs = useQuery({ queryKey: ["rfqs", actAs?.id, ""], queryFn: () => api<Rfq[]>("/rfqs") });
  const open = (rfqs.data ?? []).filter((r) => OPEN.has(r.status));
  const defaultTitle = question.trim().slice(0, 200) || "RFQ from the assistant";
  // An RFQ already started from this same question is the natural default (several vendors, one RFQ).
  const sameQuestion = open.find((r) => r.title === defaultTitle);
  const [choice, setChoice] = useState<string | null>(null);
  const picked = choice ?? sameQuestion?.id ?? NEW;
  const [title, setTitle] = useState(defaultTitle);

  const go = useMutation({
    mutationFn: async () => {
      let id = picked;
      if (picked === NEW) {
        const created = await api<Rfq>("/rfqs", {
          method: "POST",
          body: { title: title.trim() || defaultTitle, description: question.slice(0, 5000), equipment_categories: (requirement?.equipment_categories ?? []).slice(0, 10) },
        });
        id = created.id;
        toast.success(`Draft ${created.rfq_number} created`);
      }
      await api(`/rfqs/${id}/vendors`, { method: "POST", body: { vendor_id: vendor.vendor_id } });
      return id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["rfqs"] });
      void qc.invalidateQueries({ queryKey: ["rfq-vendors", id] });
      void qc.invalidateQueries({ queryKey: ["rfq-email", id] });
      onReady(id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const option = (value: string, label: React.ReactNode, detail: React.ReactNode) => (
    <label
      key={value}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm transition-colors hover:bg-muted/40",
        picked === value && "border-primary bg-primary/5",
      )}
    >
      <input type="radio" name="rfq-choice" className="mt-1 accent-primary" checked={picked === value} onChange={() => setChoice(value)} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Send an RFQ to {vendor.name}</DialogTitle>
          <DialogDescription>Choose the RFQ. {vendor.name} is added to it, then you preview the e-mail and send it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {option(
            NEW,
            "New RFQ from this question",
            <span className="mt-1.5 block" onClick={(e) => e.preventDefault()}>
              <Label htmlFor="rfq-title" className="sr-only">
                RFQ title
              </Label>
              <Input id="rfq-title" value={title} maxLength={200} onFocus={() => setChoice(NEW)} onChange={(e) => setTitle(e.target.value)} />
            </span>,
          )}
          {rfqs.isPending && <p className="text-xs text-muted-foreground">Loading your open RFQs…</p>}
          {open.length > 0 && <p className="pt-1 text-xs font-medium text-muted-foreground">Or add to an open RFQ</p>}
          <div className="grid max-h-60 gap-2 overflow-y-auto">
            {open.map((r) =>
              option(
                r.id,
                <>
                  {r.rfq_number} · {r.title}
                </>,
                <>
                  {humanize(r.status)}
                  {r.project_name ? ` · ${r.project_name}` : ""}
                  {r.id === sameQuestion?.id ? " · started from this question" : ""}
                </>,
              ),
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={go.isPending || (picked === NEW && !title.trim())} onClick={() => go.mutate()}>
            <Mail /> {go.isPending ? "Preparing…" : "Continue to e-mail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
