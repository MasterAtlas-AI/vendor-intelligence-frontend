"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ChoiceList } from "@/components/choice-list";
import { CodePicker } from "@/components/code-picker";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebounced } from "@/hooks/use-debounced";
import { treeItems, useCertificationTypes, useEquipmentCategories, useIndustries, useServiceCategories } from "@/hooks/use-taxonomy";
import { api } from "@/lib/api/client";
import type { AiUsage, DiscoveryAccepted, DiscoveryEstimate, DiscoveryRequest, Region } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

const REGIONS: { value: Region; label: string }[] = [
  { value: "global", label: "Worldwide" },
  { value: "europe", label: "Europe" },
  { value: "middle_east", label: "Middle East" },
  { value: "south_asia", label: "South Asia" },
  { value: "south_east_asia", label: "South-East Asia" },
  { value: "east_asia", label: "East Asia" },
  { value: "north_america", label: "North America" },
  { value: "latin_america", label: "Latin America" },
  { value: "africa", label: "Africa" },
  { value: "oceania", label: "Oceania" },
];

const EMPTY: DiscoveryRequest = {
  equipment_categories: [],
  service_categories: [],
  industries: [],
  regions: [],
  countries: [],
  standards: [],
  certifications: [],
  brief: "",
  max_candidates: 15,
  pages_per_vendor: 6,
  include_existing: true,
};

/** "API 610, NORSOK M-650" -> ["API 610", "NORSOK M-650"] */
function splitList(text: string): string[] {
  return text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function usd(n: number | string): string {
  return `US$${Number(n).toFixed(2)}`;
}

export default function NewDiscoveryPage() {
  const router = useRouter();
  const canRun = useCan(P.DISCOVERY_RUN);
  const equipment = useEquipmentCategories();
  const services = useServiceCategories();
  const industries = useIndustries();
  const certifications = useCertificationTypes();
  const [req, setReq] = useState<DiscoveryRequest>(EMPTY);
  const [countries, setCountries] = useState("");
  const [standards, setStandards] = useState("");
  const set = <K extends keyof DiscoveryRequest>(key: K, value: DiscoveryRequest[K]) => setReq((r) => ({ ...r, [key]: value }));

  const body: DiscoveryRequest = { ...req, countries: splitList(countries), standards: splitList(standards) };
  const ready = Boolean(req.equipment_categories?.length || req.service_categories?.length || req.brief.trim());
  const debounced = useDebounced(JSON.stringify(body), 400);

  const usage = useQuery({ queryKey: ["ai-usage"], queryFn: () => api<AiUsage>("/ai/usage"), enabled: canRun });
  const estimate = useQuery({
    queryKey: ["discovery-estimate", debounced],
    queryFn: ({ signal }) => api<DiscoveryEstimate>("/discovery/estimate", { method: "POST", body: JSON.parse(debounced), signal }),
    enabled: canRun && ready,
    retry: false,
  });

  const start = useMutation({
    mutationFn: () => api<DiscoveryAccepted>("/discovery/vendors", { method: "POST", body }),
    onSuccess: (r) => {
      toast.success("Discovery started");
      // Next keeps visited routes' state, so clear the form for the next visit.
      setReq(EMPTY);
      setCountries("");
      setStandards("");
      router.push(`/discovery/${r.job_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canRun) return <NoAccess what="AI discovery" />;
  const est = estimate.data;
  const remaining = usage.data ? Number(usage.data.remaining_usd) : null;
  const tooExpensive = Boolean(est && remaining !== null && est.typical_cost_usd > remaining);

  return (
    <>
      <Link href="/discovery" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> AI discovery
      </Link>
      <PageHeader
        title="Discover vendors"
        description="Describe what you need. The AI searches the web, reads each supplier's own website and proposes what it can prove, quoting the page. Curators review everything before it joins the knowledge base."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What are you looking for?</CardTitle>
            <CardDescription>Choose at least one equipment or service category, or describe the need in your own words.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-1.5">
              <Label>Equipment</Label>
              <CodePicker
                label="Equipment categories"
                placeholder="Add an equipment category…"
                options={treeItems(equipment.data)}
                value={req.equipment_categories ?? []}
                onChange={(v) => set("equipment_categories", v)}
                max={5}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Services</Label>
              <CodePicker
                label="Service categories"
                placeholder="Add a service category…"
                options={treeItems(services.data)}
                value={req.service_categories ?? []}
                onChange={(v) => set("service_categories", v)}
                max={5}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="brief">In your own words</Label>
              <Textarea
                id="brief"
                rows={3}
                maxLength={1000}
                placeholder="e.g. Water injection pumps for FPSO topsides, 3,000 m³/h, duplex stainless"
                value={req.brief}
                onChange={(e) => set("brief", e.target.value)}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Industries</Label>
                <CodePicker
                  label="Industries"
                  placeholder="Add an industry…"
                  options={(industries.data ?? []).map((i) => ({ value: i.code, label: i.name }))}
                  value={req.industries ?? []}
                  onChange={(v) => set("industries", v)}
                  max={5}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Certifications</Label>
                <CodePicker
                  label="Certifications"
                  placeholder="Add a certification…"
                  options={(certifications.data ?? []).map((c) => ({ value: c.code, label: c.name }))}
                  value={req.certifications ?? []}
                  onChange={(v) => set("certifications", v)}
                  max={10}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="standards">Standards</Label>
                <Input id="standards" placeholder="API 610, NORSOK M-650" value={standards} onChange={(e) => setStandards(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="countries">Countries</Label>
                <Input id="countries" placeholder="India, NO, United Arab Emirates" value={countries} onChange={(e) => setCountries(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Regions</Label>
              <div className="grid gap-x-4 sm:grid-cols-3">
                <ChoiceList
                  idPrefix="region"
                  choices={REGIONS}
                  value={req.regions ?? []}
                  onChange={(v) => set("regions", v.slice(0, 5) as Region[])}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Size of the search</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="max-candidates">Suppliers to research (3–25)</Label>
                <Input
                  id="max-candidates"
                  type="number"
                  min={3}
                  max={25}
                  value={req.max_candidates}
                  onChange={(e) => set("max_candidates", Math.min(25, Math.max(3, Number(e.target.value) || 3)))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pages">Pages to read per supplier (2–15)</Label>
                <Input
                  id="pages"
                  type="number"
                  min={2}
                  max={15}
                  value={req.pages_per_vendor}
                  onChange={(e) => set("pages_per_vendor", Math.min(15, Math.max(2, Number(e.target.value) || 2)))}
                />
              </div>
              <Label className="flex items-start gap-2.5 font-normal">
                <Checkbox
                  aria-label="Also research vendors already in the knowledge base"
                  className="mt-0.5"
                  checked={req.include_existing}
                  onCheckedChange={(c) => set("include_existing", Boolean(c))}
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">Include known vendors</span>
                  <span className="text-xs text-muted-foreground">Research vendors already in the knowledge base too, for new facts only.</span>
                </span>
              </Label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost</CardTitle>
              <CardDescription>Charged to your organization&apos;s monthly AI budget.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {!ready && <p className="text-muted-foreground">Choose what to look for to see an estimate.</p>}
              {ready && estimate.isFetching && !est && <p className="text-muted-foreground">Estimating…</p>}
              {ready && estimate.isError && <p className="text-destructive">{errorMessage(estimate.error)}</p>}
              {ready && est && (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                  <dt className="text-muted-foreground">Typical</dt>
                  <dd className="font-medium tabular-nums">{usd(est.typical_cost_usd)}</dd>
                  <dt className="text-muted-foreground">At most</dt>
                  <dd className="tabular-nums">{usd(est.max_cost_usd)}</dd>
                  <dt className="text-muted-foreground">Web searches</dt>
                  <dd className="tabular-nums">{est.web_searches}</dd>
                </dl>
              )}
              {usage.data && (
                <p className="text-xs text-muted-foreground">
                  {usd(usage.data.remaining_usd)} left of {usd(usage.data.budget_usd)} this month.
                </p>
              )}
              {usage.data && !usage.data.configured && <p className="text-destructive">AI isn&apos;t configured on this server.</p>}
              {tooExpensive && <p className="text-destructive">This search would go over the remaining budget. Make it smaller.</p>}
              <Button
                disabled={!ready || !est || tooExpensive || start.isPending || usage.data?.configured === false}
                onClick={() => start.mutate()}
              >
                <Sparkles /> {start.isPending ? "Starting…" : "Start discovery"}
              </Button>
              <p className="text-xs text-muted-foreground">Takes a few minutes. You can leave the page; it runs in the background.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
