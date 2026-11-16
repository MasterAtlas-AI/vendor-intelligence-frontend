"use client";

import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Contact, Globe, MapPin, Package, PackageSearch, ScrollText, ShieldCheck, Sparkles, WandSparkles, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { DiscoveryAccepted, VendorDetail } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

type LookupField = "website" | "hq_country" | "description" | "contacts" | "class_approvals";

/** The jobs started from this page, so it can show each result panel with approve / reject. */
export interface VendorAiJobs {
  products?: string;
  research: string[];
  lookups: { field: LookupField; jobId: string }[];
}

type ActionKey =
  | "website"
  | "hq_country"
  | "description"
  | "class_approvals"
  | "contacts"
  | "products"
  | "products_deep"
  | "equipment"
  | "services"
  | "refresh";

interface Action {
  label: string;
  detail: string;
  usd: number;
  icon: React.ComponentType;
  needsSite: boolean; // reads the vendor's own website
  curator: boolean; // a knowledge-base look-up (curators) rather than website research (discovery:run)
}

const ACTIONS: Record<ActionKey, Action> = {
  website: { label: "Find the website", detail: "Web search for the company's own site.", usd: 0.014, icon: Globe, needsSite: false, curator: true },
  hq_country: { label: "Find the headquarters", detail: "Web search for the head office country and city.", usd: 0.014, icon: MapPin, needsSite: false, curator: true },
  description: { label: "Write a description", detail: "Web search for what the company does.", usd: 0.014, icon: ScrollText, needsSite: false, curator: true },
  class_approvals: {
    label: "Class type approvals",
    detail: "Certificates on the DNV, ABS, LR, BV, IRS, CCS, KR and ClassNK registers.",
    usd: 0.015,
    icon: ShieldCheck,
    needsSite: false,
    curator: true,
  },
  contacts: { label: "Contact details", detail: "Company emails, phone lines and office addresses from its site.", usd: 0.01, icon: Contact, needsSite: true, curator: true },
  products: { label: "Full product details", detail: "Every product line with specifications (up to 25 pages).", usd: 0.05, icon: PackageSearch, needsSite: true, curator: false },
  products_deep: {
    label: "Full product details, large catalogue",
    detail: "Up to 60 pages, one level deeper, for many models.",
    usd: 0.15,
    icon: Package,
    needsSite: true,
    curator: false,
  },
  equipment: { label: "Equipment & certifications", detail: "What it makes or supplies, and its certificates.", usd: 0.04, icon: Wrench, needsSite: true, curator: false },
  services: { label: "Services", detail: "The services it offers (installation, repair, inspection...).", usd: 0.04, icon: Sparkles, needsSite: true, curator: false },
  refresh: {
    label: "Research everything on its website",
    detail: "Services, certifications, industries and projects in one pass.",
    usd: 0.05,
    icon: Sparkles,
    needsSite: true,
    curator: false,
  },
};

const MENU: { title: string; keys: ActionKey[] }[] = [
  { title: "From the vendor's website", keys: ["products", "products_deep", "equipment", "services", "refresh", "contacts"] },
  { title: "Web search", keys: ["website", "hq_country", "description", "class_approvals"] },
];

async function startAction(vendorId: string, key: ActionKey, jobs: VendorAiJobs): Promise<void> {
  if (key === "products" || key === "products_deep") {
    const depth = key === "products" ? "standard" : "deep";
    jobs.products = (await api<DiscoveryAccepted>(`/discovery/vendors/${vendorId}/products`, { method: "POST", body: { depth } })).job_id;
  } else if (key === "equipment" || key === "services" || key === "refresh") {
    const r = await api<DiscoveryAccepted>(`/discovery/vendors/${vendorId}/${key}`, { method: "POST", body: { max_pages: 12 } });
    jobs.research.push(r.job_id);
  } else {
    const r = await api<components["schemas"]["LookupAccepted"]>("/admin/data-quality/lookup", {
      method: "POST",
      body: { vendor_ids: [vendorId], field: key },
    });
    jobs.lookups.push({ field: key, jobId: r.job_id });
  }
}

/** Every AI action on a vendor: "Get everything with AI" runs all that is useful in one go; "More AI options" runs
 *  one at a time. Results open on the page; nothing changes in the knowledge base until a curator approves. */
export function VendorAiActions({ vendor, onStarted }: { vendor: VendorDetail; onStarted: (jobs: VendorAiJobs) => void }) {
  const canRun = useCan(P.DISCOVERY_RUN);
  const canCurate = useCan(P.KNOWLEDGE_APPROVE);
  const hasSite = Boolean(vendor.website || vendor.domains.length);
  const [confirm, setConfirm] = useState<ActionKey[] | null>(null); // the actions waiting for "Start"
  const [isAll, setIsAll] = useState(false);

  const allowed = (k: ActionKey) => (ACTIONS[k].curator ? canCurate : canRun);
  // A look-up for a detail the vendor already has would only answer "already filled": not offered.
  const filled: Partial<Record<ActionKey, boolean>> = {
    website: hasSite,
    hq_country: Boolean(vendor.hq_country),
    description: (vendor.description ?? "").length >= 40,
  };
  // What "everything" means for this vendor: the missing basics, then all the website work (one product pass).
  const everything: ActionKey[] = (
    [
      !hasSite && "website",
      !vendor.hq_country && "hq_country",
      (vendor.description ?? "").length < 40 && "description",
      hasSite && "products",
      hasSite && "refresh",
      hasSite && "contacts",
      "class_approvals",
    ] as (ActionKey | false)[]
  ).filter((k): k is ActionKey => Boolean(k) && allowed(k as ActionKey));
  const waitingForSite = !hasSite && (canRun || canCurate);

  const start = useMutation({
    mutationFn: async (keys: ActionKey[]) => {
      const jobs: VendorAiJobs = { research: [], lookups: [] };
      const errors: string[] = [];
      await Promise.all(
        keys.map(async (k) => {
          try {
            await startAction(vendor.id, k, jobs);
          } catch (e) {
            errors.push(`${ACTIONS[k].label}: ${errorMessage(e)}`);
          }
        }),
      );
      if (errors.length) toast.error(errors.join(" · "));
      return jobs;
    },
    onSuccess: (jobs) => {
      setConfirm(null);
      const started = (jobs.products ? 1 : 0) + jobs.research.length + jobs.lookups.length;
      if (started) {
        toast.success(`${started} AI action${started === 1 ? "" : "s"} started. Results appear on this page as they finish.`);
        onStarted(jobs);
      }
    },
  });

  if (vendor.status === "retired" || (!canRun && !canCurate)) return null;
  const cost = (confirm ?? []).reduce((sum, k) => sum + ACTIONS[k].usd, 0);

  return (
    <>
      <div className="flex">
        <Button
          className="rounded-r-none"
          disabled={!everything.length || start.isPending}
          onClick={() => {
            setIsAll(true);
            setConfirm(everything);
          }}
        >
          <WandSparkles /> Get everything with AI
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="More AI options" title="More AI options" disabled={start.isPending} />}
          >
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            {MENU.map((group, i) => {
              const keys = group.keys.filter((k) => allowed(k) && !filled[k]);
              if (!keys.length) return null;
              return (
                <DropdownMenuGroup key={group.title}>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
                  {keys.map((k) => {
                    const a = ACTIONS[k];
                    const Icon = a.icon;
                    const blocked = a.needsSite && !hasSite;
                    return (
                      <DropdownMenuItem
                        key={k}
                        disabled={blocked}
                        className="items-start"
                        onClick={() => {
                          setIsAll(false);
                          setConfirm([k]);
                        }}
                      >
                        <Icon />
                        <span className="grid gap-0.5">
                          <span>{a.label}</span>
                          <span className="text-xs text-muted-foreground">{blocked ? "Needs the vendor's website first." : a.detail}</span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isAll ? `Get everything for ${vendor.display_name}?` : `${confirm ? ACTIONS[confirm[0]].label : ""}?`}</DialogTitle>
            <DialogDescription>
              {isAll
                ? "The AI runs all of these at once. Each result appears on this page with approve and reject; nothing changes until a curator approves."
                : "The result appears on this page with approve and reject; nothing changes until a curator approves."}
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 text-sm">
            {(confirm ?? []).map((k) => {
              const Icon = ACTIONS[k].icon;
              return (
                <li key={k} className="flex items-start gap-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
                  <Icon />
                  <span>
                    <span className="font-medium">{ACTIONS[k].label}</span>
                    <span className="block text-xs text-muted-foreground">{ACTIONS[k].detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {isAll && waitingForSite && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Product details, website research and contact details need the vendor&apos;s website. Approve the website the AI finds, then click &ldquo;Get everything with
              AI&rdquo; again for the rest.
            </p>
          )}
          <DialogFooter className="items-center">
            <span className="mr-auto text-xs text-muted-foreground">About US${cost.toFixed(2)} from the AI budget</span>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button disabled={!confirm?.length || start.isPending} onClick={() => confirm && start.mutate(confirm)}>
              {start.isPending ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
