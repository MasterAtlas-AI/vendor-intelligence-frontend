"use client";

import { useMutation } from "@tanstack/react-query";
import { WandSparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { DiscoveryAccepted, VendorDetail } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

type LookupField = "website" | "hq_country" | "description" | "contacts";
type Step = "website" | "hq_country" | "description" | "products" | "research" | "contacts";

/** The jobs one "do everything" run started, so the vendor page can show each result panel. */
export interface RunAllJobs {
  products?: string;
  research?: string;
  lookups: { field: LookupField; jobId: string }[];
}

const STEPS: Record<Step, { label: string; detail: string; usd: number; needsSite: boolean; curator: boolean }> = {
  website: { label: "Find the website", detail: "Web search for the company's own site.", usd: 0.014, needsSite: false, curator: true },
  hq_country: { label: "Find the headquarters", detail: "Web search for the head office country and city.", usd: 0.014, needsSite: false, curator: true },
  description: { label: "Write a description", detail: "Web search for what the company does.", usd: 0.014, needsSite: false, curator: true },
  products: { label: "Full product details", detail: "Every product line with specifications (25 pages).", usd: 0.05, needsSite: true, curator: false },
  research: { label: "Research everything", detail: "Services, certifications, industries and projects.", usd: 0.05, needsSite: true, curator: false },
  contacts: { label: "Contact details", detail: "Company emails, phone lines and office addresses.", usd: 0.01, needsSite: true, curator: true },
};

/** One button for every AI action on a vendor: picks what's useful (missing basics, products, research, contacts),
 *  starts them together and hands the jobs to the page, which shows each result with approve / reject. */
export function RunAllButton({ vendor, onStarted }: { vendor: VendorDetail; onStarted: (jobs: RunAllJobs) => void }) {
  const canRun = useCan(P.DISCOVERY_RUN);
  const canCurate = useCan(P.KNOWLEDGE_APPROVE);
  const hasSite = Boolean(vendor.website || vendor.domains.length);
  const [open, setOpen] = useState(false);

  const available = (Object.keys(STEPS) as Step[]).filter((s) => {
    const step = STEPS[s];
    if (step.curator ? !canCurate : !canRun) return false;
    if (s === "website") return !hasSite;
    if (s === "hq_country") return !vendor.hq_country;
    if (s === "description") return (vendor.description ?? "").length < 40;
    return true;
  });
  const [picked, setPicked] = useState<Set<Step>>(new Set());

  const start = useMutation({
    mutationFn: async (): Promise<RunAllJobs> => {
      const steps = available.filter((s) => picked.has(s) && (hasSite || !STEPS[s].needsSite));
      const jobs: RunAllJobs = { lookups: [] };
      const errors: string[] = [];
      await Promise.all(
        steps.map(async (s) => {
          try {
            if (s === "products") {
              jobs.products = (await api<DiscoveryAccepted>(`/discovery/vendors/${vendor.id}/products`, { method: "POST", body: { depth: "standard" } })).job_id;
            } else if (s === "research") {
              jobs.research = (await api<DiscoveryAccepted>(`/discovery/vendors/${vendor.id}/refresh`, { method: "POST", body: { max_pages: 12 } })).job_id;
            } else {
              const r = await api<components["schemas"]["LookupAccepted"]>("/admin/data-quality/lookup", {
                method: "POST",
                body: { vendor_ids: [vendor.id], field: s },
              });
              jobs.lookups.push({ field: s, jobId: r.job_id });
            }
          } catch (e) {
            errors.push(`${STEPS[s].label}: ${errorMessage(e)}`);
          }
        }),
      );
      if (errors.length) toast.error(errors.join(" · "));
      return jobs;
    },
    onSuccess: (jobs) => {
      setOpen(false);
      if (jobs.products || jobs.research || jobs.lookups.length) onStarted(jobs);
    },
  });

  if (!available.length || vendor.status === "retired") return null;
  const runnable = available.filter((s) => hasSite || !STEPS[s].needsSite);
  const chosen = runnable.filter((s) => picked.has(s));
  const cost = chosen.reduce((sum, s) => sum + STEPS[s].usd, 0);

  return (
    <>
      <Button
        onClick={() => {
          setPicked(new Set(runnable));
          setOpen(true);
        }}
      >
        <WandSparkles /> Do everything with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Do everything with AI</DialogTitle>
            <DialogDescription>
              Runs these together for {vendor.display_name}. Each result appears on this page with approve and reject; nothing changes until you
              approve.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {available.map((s) => {
              const blocked = STEPS[s].needsSite && !hasSite;
              return (
                <Label key={s} className={`flex items-start gap-3 rounded-lg border p-3 font-normal ${blocked ? "opacity-60" : ""}`}>
                  <Checkbox
                    aria-label={STEPS[s].label}
                    className="mt-0.5"
                    disabled={blocked}
                    checked={!blocked && picked.has(s)}
                    onCheckedChange={(c) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (c) next.add(s);
                        else next.delete(s);
                        return next;
                      })
                    }
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{STEPS[s].label}</span>
                    <span className="text-xs text-muted-foreground">
                      {blocked ? "Needs the website first: approve it, then run this again." : STEPS[s].detail}
                    </span>
                  </span>
                </Label>
              );
            })}
          </div>
          <DialogFooter className="items-center">
            <span className="mr-auto text-xs text-muted-foreground">About US${cost.toFixed(2)} from the AI budget</span>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!chosen.length || start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? "Starting…" : `Start ${chosen.length} action${chosen.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
