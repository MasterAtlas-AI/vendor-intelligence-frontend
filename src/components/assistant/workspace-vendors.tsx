"use client";

import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { SearchIntent, VendorDetail } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { countryName } from "@/lib/vendors";

import { activeDims, Bar, Chip, codeLabel, fullIntent, Panel, type Ranked } from "./workspace-shared";

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
const under = (have: string, wanted: string) => have === wanted || have.startsWith(`${wanted}.`);

/** The request's requirements checked against the vendor's approved facts. */
export function checklist(intent: SearchIntent | null | undefined, v: VendorDetail): { ok: boolean; label: string; evidence: string }[] {
  const req = fullIntent(intent);
  if (!req) return [];
  const out: { ok: boolean; label: string; evidence: string }[] = [];
  for (const code of req.equipment_categories) {
    const hit = v.equipment.find((e) => under(e.category.code, code));
    out.push({ ok: Boolean(hit), label: `Makes ${codeLabel(code)}`, evidence: hit ? `${hit.name}${hit.model_series ? ` (${hit.model_series})` : ""}` : "No matching product on record" });
  }
  for (const std of req.standards) {
    const product = v.equipment.find((e) => e.standards.some((s) => norm(s).includes(norm(std))));
    const cert = v.certifications.find((c) => norm(c.certification.name).includes(norm(std)));
    out.push({
      ok: Boolean(product || cert),
      label: `${std} compliance`,
      evidence: product ? `Product: ${product.name}` : cert ? `Certificate: ${cert.certification.name}` : "Not on record",
    });
  }
  for (const code of req.certifications) {
    const cert = v.certifications.find((c) => c.certification.code === code);
    out.push({
      ok: Boolean(cert),
      label: `Holds ${codeLabel(code)}`,
      evidence: cert ? [cert.certificate_number && `No. ${cert.certificate_number}`, cert.valid_to && `valid to ${cert.valid_to}`].filter(Boolean).join(", ") || "On record" : "Not on record",
    });
  }
  for (const code of req.industries) {
    const ind = v.industries.find((i) => under(i.code, code));
    out.push({ ok: Boolean(ind), label: `${codeLabel(code)} industry experience`, evidence: ind ? ind.name : "Not on record" });
  }
  if (req.countries.length) {
    const ok = Boolean(v.hq_country && req.countries.includes(v.hq_country)) || v.locations.some((l) => l.country && req.countries.includes(l.country));
    out.push({ ok, label: `Located in ${req.countries.map(countryName).join(" / ")}`, evidence: ok ? "Head office or a location there" : `Head office: ${countryName(v.hq_country)}` });
  }
  return out;
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ScorecardTab({
  ranked,
  selected,
  onSelect,
  details,
  loading,
  requirement,
}: {
  ranked: Ranked[];
  selected: string | null;
  onSelect: (id: string) => void;
  details: Record<string, VendorDetail>;
  loading: boolean;
  requirement: SearchIntent | null | undefined;
}) {
  const row = ranked.find((r) => r.vendor_id === selected) ?? ranked[0];
  if (!row) return <p className="text-sm text-muted-foreground">No vendors in this answer.</p>;
  const v = details[row.vendor_id];
  const dims = activeDims(ranked);
  const checks = v ? checklist(requirement, v) : [];

  return (
    <div className="grid gap-4">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4">
        <div className="grid gap-1">
          <select
            aria-label="Vendor"
            className="-ml-1 max-w-full rounded-md bg-transparent px-1 text-lg font-semibold hover:bg-muted"
            value={row.vendor_id}
            onChange={(e) => onSelect(e.target.value)}
          >
            {ranked.map((r) => (
              <option key={r.vendor_id} value={r.vendor_id}>
                {r.rank}. {r.name}
              </option>
            ))}
          </select>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {[countryName(row.country), row.city].filter((x) => x && x !== "—").join(" · ")} · Rank #{row.rank} of {ranked.length}
            {row.avl_status && <StatusBadge status={row.avl_status} />}
            <Link href={`/vendors/${row.vendor_id}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
              Open vendor page <ExternalLink className="size-3" />
            </Link>
          </p>
        </div>
        <div className="text-right">
          <div>
            <span className="text-3xl font-semibold tabular-nums">{row.score.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">/10</span>
          </div>
          <span className="text-xs text-muted-foreground">composite score</span>
        </div>
      </section>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Panel title="Dimension scores">
          <div className="grid gap-2">
            {dims.map((d) => {
              const value = row.scores[d.key];
              return (
                <div key={d.key} className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                  <span className="truncate">{d.label}</span>
                  <Bar value={value ?? 0} className="h-2" />
                  <span className="text-right font-medium tabular-nums">{value === null || value === undefined ? "—" : Math.round(value * 100)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Requirement checklist">
          {!v ? (
            <Skeleton className="h-24" />
          ) : checks.length ? (
            <ul className="grid gap-2 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
                  <span>
                    <span className="font-medium">{c.label}</span> <span className="text-muted-foreground">· {c.evidence}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">The question didn&apos;t name specific equipment, standards or countries to check.</p>
          )}
        </Panel>
      </div>

      {!v ? (
        loading && <Skeleton className="h-40" />
      ) : (
        <>
          <div className="grid gap-4 @3xl:grid-cols-2">
            <Panel title="Company">
              <Facts
                rows={[
                  ["Website", v.website ? <a href={v.website} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">{v.website.replace(/^https?:\/\/(www\.)?/, "")}</a> : "—"],
                  ["Head office", [v.hq_city, countryName(v.hq_country)].filter(Boolean).join(", ")],
                  ["Industries", v.industries.map((i) => i.name).join(", ") || "—"],
                  ["Data completeness", `${Math.round(row.scores.data_quality * 100)}%`],
                  ["Last verified", v.last_verified_at ? formatDateTime(v.last_verified_at) : "Not yet"],
                  ["Contacts", v.contacts.length ? v.contacts.map((c) => c.email ?? c.phone).filter(Boolean).slice(0, 3).join(" · ") : "—"],
                ]}
              />
            </Panel>
            <Panel title="Track record & certifications">
              <Facts
                rows={[
                  ["Project references", `${row.references}${row.fpso_references ? ` (${row.fpso_references} FPSO)` : ""}`],
                  ["Latest project", v.projects.length ? [...v.projects].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).map((p) => `${p.project_name}${p.year ? ` (${p.year})` : ""}`)[0] : "—"],
                  ["Certifications", v.certifications.map((c) => c.certification.name).join(", ") || "—"],
                  ["Products on record", String(v.equipment.length)],
                  ["Services", v.services.map((s) => s.category.name).slice(0, 4).join(", ") || "—"],
                ]}
              />
            </Panel>
          </div>

          {v.equipment.length > 0 && (
            <Panel title={`Products (${v.equipment.length})`}>
              <div className="grid gap-2">
                {v.equipment.slice(0, 8).map((e) => (
                  <div key={e.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.name}</span>
                      {e.model_series && <span className="text-xs text-muted-foreground">{e.model_series}</span>}
                      <Chip>{e.category.name}</Chip>
                      {e.standards.map((s) => (
                        <Chip key={s} tone="ok">
                          {s}
                        </Chip>
                      ))}
                    </div>
                    {Object.keys(e.specs).length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {Object.entries(e.specs)
                          .filter(([k]) => k !== "Overview")
                          .slice(0, 4)
                          .map(([k, val]) => `${k}: ${String(val)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
                {v.equipment.length > 8 && <p className="text-xs text-muted-foreground">And {v.equipment.length - 8} more on the vendor page.</p>}
              </div>
            </Panel>
          )}

          {row.flags.length > 0 && (
            <Panel title="Gaps to check">
              <div className="flex flex-wrap gap-2">
                {row.flags.map((f) => (
                  <Chip key={f} tone="warn">
                    {f}
                  </Chip>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Source citations">
            {v.sources.length ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">Source</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Retrieved</th>
                      <th className="p-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.sources.slice(0, 10).map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="max-w-80 truncate p-2">
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noreferrer noopener" className="hover:underline" title={s.url}>
                              {s.title || s.url}
                            </a>
                          ) : (
                            s.title || "—"
                          )}
                        </td>
                        <td className="p-2 capitalize">{s.kind}</td>
                        <td className="p-2 text-xs text-muted-foreground">{s.retrieved_at ? formatDateTime(s.retrieved_at) : "—"}</td>
                        <td className="p-2">
                          <Chip tone="ok">Reviewed fact</Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sources on record for this vendor.</p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

type View = "technical" | "track" | "certs" | "contacts";
const VIEWS: { key: View; label: string }[] = [
  { key: "technical", label: "Technical" },
  { key: "track", label: "Track record" },
  { key: "certs", label: "Certifications" },
  { key: "contacts", label: "Contacts" },
];

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

export function CompareTab({ ranked, details, loading, onOpenVendor }: { ranked: Ranked[]; details: Record<string, VendorDetail>; loading: boolean; onOpenVendor: (id: string) => void }) {
  const [view, setView] = useState<View>("technical");
  const [q, setQ] = useState("");
  const rows = ranked.filter((r) => {
    if (!q.trim()) return true;
    const v = details[r.vendor_id];
    const hay = [r.name, countryName(r.country), ...(v?.equipment.map((e) => `${e.name} ${e.category.name} ${e.standards.join(" ")}`) ?? [])].join(" ").toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  const head: Record<View, string[]> = {
    technical: ["Vendor", "Country", "Products", "Equipment types", "Standards"],
    track: ["Vendor", "References", "FPSO", "Latest project", "Clients"],
    certs: ["Vendor", "Certifications", "Earliest expiry", "Verified"],
    contacts: ["Vendor", "Website", "Emails", "Phones"],
  };
  const cells = (r: Ranked): React.ReactNode[] => {
    const v = details[r.vendor_id];
    if (!v) return head[view].slice(1).map((h) => (loading ? <Skeleton key={h} className="h-4 w-16" /> : "—"));
    switch (view) {
      case "technical":
        return [countryName(v.hq_country), v.equipment.length, uniq(v.equipment.map((e) => e.category.name)).slice(0, 3).join(", ") || "—", uniq(v.equipment.flatMap((e) => e.standards)).slice(0, 4).join(", ") || "—"];
      case "track": {
        const latest = [...v.projects].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
        return [r.references, r.fpso_references, latest ? `${latest.project_name}${latest.year ? ` (${latest.year})` : ""}` : "—", uniq(v.projects.map((p) => p.client)).slice(0, 3).join(", ") || "—"];
      }
      case "certs": {
        const expiry = v.certifications.map((c) => c.valid_to).filter(Boolean).sort()[0];
        return [v.certifications.map((c) => c.certification.name).join(", ") || "—", expiry ?? "—", `${v.certifications.filter((c) => c.verified).length} of ${v.certifications.length}`];
      }
      case "contacts":
        return [
          v.website ? (
            <a href={v.website} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              {v.website.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          ) : (
            "—"
          ),
          uniq(v.contacts.map((c) => c.email)).slice(0, 2).join(", ") || "—",
          uniq(v.contacts.map((c) => c.phone)).slice(0, 2).join(", ") || "—",
        ];
    }
  };

  return (
    <Panel title="Compare vendors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setView(x.key)}
              className={`rounded-full border px-3 py-1 text-xs ${view === x.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <Input aria-label="Filter vendors" placeholder="Filter by vendor, country, product…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-64 max-w-full" />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              {head[view].map((h) => (
                <th key={h} className="p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vendor_id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => onOpenVendor(r.vendor_id)}>
                <td className="p-2 font-medium">{r.name}</td>
                {cells(r).map((c, i) => (
                  <td key={i} className="p-2">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {rows.length} of {ranked.length} vendors · approved facts from the knowledge base
      </p>
    </Panel>
  );
}
