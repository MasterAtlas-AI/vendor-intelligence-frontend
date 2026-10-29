"use client";

import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import type { DiscoveryAccepted, VendorDetail } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

type Kind = "equipment" | "services" | "refresh";

const KINDS: Record<Kind, { label: string; what: string }> = {
  equipment: { label: "Equipment & certifications", what: "equipment and certifications" },
  services: { label: "Services", what: "services" },
  refresh: { label: "Everything", what: "everything (equipment, services, certifications, industries, projects)" },
};

/** Starts AI research of a known vendor's own website; findings go to curator review. */
export function ResearchCard({ vendor }: { vendor: VendorDetail }) {
  const router = useRouter();
  const canRun = useCan(P.DISCOVERY_RUN);
  const [kind, setKind] = useState<Kind | null>(null);
  const start = useMutation({
    mutationFn: (k: Kind) => api<DiscoveryAccepted>(`/discovery/vendors/${vendor.id}/${k}`, { method: "POST", body: { max_pages: 12 } }),
    onSuccess: (r) => {
      toast.success("Research started");
      setKind(null);
      router.push(`/discovery/${r.job_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canRun) return null;
  const hasSite = Boolean(vendor.website || vendor.domains.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Research with AI</CardTitle>
        <CardDescription>
          {hasSite
            ? "Reads this vendor's website and proposes new facts, each quoting its source page. A curator reviews them."
            : "Add a website for this vendor first; the AI only reads the vendor's own site."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <Button key={k} variant="outline" size="sm" className="justify-start" disabled={!hasSite || start.isPending} onClick={() => setKind(k)}>
            <Sparkles /> {KINDS[k].label}
          </Button>
        ))}
      </CardContent>
      <ConfirmDialog
        open={kind !== null}
        onOpenChange={(o) => !o && setKind(null)}
        title={`Research ${vendor.display_name}?`}
        description={
          kind &&
          `The AI reads up to 12 pages of ${vendor.domains[0] ?? "the vendor's website"} for ${KINDS[kind].what}. ` +
            "It usually costs a few cents from your monthly AI budget and takes 2–4 minutes."
        }
        confirmLabel="Start research"
        pending={start.isPending}
        onConfirm={() => kind && start.mutate(kind)}
      />
    </Card>
  );
}
