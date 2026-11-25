"use client";

import { Download, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { WebVendor } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { countryName } from "@/lib/vendors";

import { Chip, Panel } from "./workspace-shared";

const FIT: Record<WebVendor["fit"], { label: string; tone: "ok" | "muted" | "warn" }> = {
  high: { label: "Strong match", tone: "ok" },
  medium: { label: "Possible match", tone: "muted" },
  low: { label: "Weak match", tone: "warn" },
};

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");

function csv(rows: WebVendor[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Supplier", "Country", "Supplies", "Match", "Website", "Source page", "In knowledge base"];
  return [
    head.map(cell).join(","),
    ...rows.map((w) => [w.name, countryName(w.country), w.supplies, FIT[w.fit].label, w.website ?? "", w.source.url, w.known_vendor_name ?? ""].map(cell).join(",")),
  ].join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Suppliers the web search found beyond the knowledge-base shortlist. They have no score: nothing about them is
 * verified yet. "Add to knowledge base" researches the supplier's own site (AI discovery), and after curator
 * approval it joins the shortlist on later questions with full scores.
 */
export function WebVendorsPanel({ vendors }: { vendors: WebVendor[] }) {
  const canDiscover = useCan(P.DISCOVERY_RUN);
  const canExport = useCan(P.DATA_EXPORT);
  if (!vendors.length) return null;
  const brief = (w: WebVendor) => [w.name, w.website ? `(${w.website})` : "", w.supplies ? `: ${w.supplies}` : ""].join(" ").replace(/\s+:/, ":").trim();

  return (
    <Panel
      title={`More suppliers found on the web (${vendors.length})`}
      actions={
        canExport && (
          <Button variant="outline" size="sm" onClick={() => download("web-suppliers.csv", csv(vendors))}>
            <Download /> Export CSV
          </Button>
        )
      }
    >
      <p className="text-xs text-muted-foreground">
        Found by this question&apos;s web search and not on the shortlist above. They aren&apos;t scored because nothing about them is verified yet; the
        match shown is the AI&apos;s reading of the source page. Add one to the knowledge base to research its website: once approved, it is scored with
        the others.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Supplier</th>
              <th className="p-2">Supplies</th>
              <th className="w-32 p-2">Match</th>
              <th className="p-2">Source</th>
              <th className="w-44 p-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((w) => (
              <tr key={`${w.name}-${w.source.url}`} className="border-t align-top">
                <td className="p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{w.name}</span>
                    <Chip>Web</Chip>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[w.country ? countryName(w.country) : null].filter(Boolean).join(" · ")}
                    {w.website && (
                      <a href={w.website} target="_blank" rel="noreferrer" className={`${w.country ? "ml-1.5 " : ""}inline-flex items-center gap-0.5 text-primary hover:underline`}>
                        {host(w.website)} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="p-2 text-sm">{w.supplies || <span className="text-muted-foreground">—</span>}</td>
                <td className="p-2">
                  <Chip tone={FIT[w.fit].tone}>{FIT[w.fit].label}</Chip>
                </td>
                <td className="p-2">
                  <a href={w.source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-56 items-center gap-0.5 text-xs text-primary hover:underline" title={w.source.title}>
                    <span className="truncate">{host(w.source.url)}</span> <ExternalLink className="size-3 shrink-0" />
                  </a>
                </td>
                <td className="p-2 text-right">
                  {w.known_vendor_id ? (
                    <Link href={`/vendors/${w.known_vendor_id}`} className="text-xs text-primary hover:underline" title="Already in the knowledge base, but not matched by this question's search">
                      In knowledge base: {w.known_vendor_name}
                    </Link>
                  ) : canDiscover ? (
                    <Button variant="outline" size="xs" render={<Link href={`/discovery/new?brief=${encodeURIComponent(brief(w))}`} />}>
                      <Sparkles /> Add to knowledge base
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not in knowledge base</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
