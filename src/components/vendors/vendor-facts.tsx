import { BadgeCheck, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VendorDetail } from "@/lib/api/types";
import { formatDateTime, humanize } from "@/lib/format";
import { countryName } from "@/lib/vendors";

function Empty({ what }: { what: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">No {what} recorded yet.</p>;
}

function Row({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="grid gap-1 py-3">
      <div className="font-medium">{title}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {children}
    </li>
  );
}

/** A product's overview and specifications (folded away when there are many). */
function ProductSpecs({ specs }: { specs: Record<string, unknown> }) {
  const overview = typeof specs.Overview === "string" ? specs.Overview : null;
  const entries = Object.entries(specs).filter(([k]) => k !== "Overview");
  if (!overview && !entries.length) return null;
  const list = (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 pt-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted-foreground" title={k}>
            {k}
          </dt>
          <dd className="text-right font-mono text-xs leading-5 tabular-nums">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="grid gap-1">
      {overview && <p className="text-sm text-muted-foreground">{overview}</p>}
      {entries.length > 0 &&
        (entries.length <= 6 ? (
          list
        ) : (
          <details className="group">
            <summary className="cursor-pointer text-xs text-primary hover:underline">{entries.length} specifications</summary>
            {list}
          </details>
        ))}
    </div>
  );
}

/** Every approved fact about a vendor, grouped in tabs. */
export function VendorFacts({ vendor }: { vendor: VendorDetail }) {
  const tabs = [
    { key: "equipment", label: "Equipment", count: vendor.equipment.length },
    { key: "services", label: "Services", count: vendor.services.length },
    { key: "certifications", label: "Certifications", count: vendor.certifications.length },
    { key: "projects", label: "Projects", count: vendor.projects.length },
    { key: "contacts", label: "Contacts", count: vendor.contacts?.length ?? 0 },
    { key: "locations", label: "Locations", count: vendor.locations.length },
    { key: "sources", label: "Sources", count: vendor.sources.length },
  ];
  return (
    <Tabs defaultValue="equipment">
      <TabsList className="h-auto flex-wrap">
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label} <span className="text-muted-foreground tabular-nums">{t.count}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="equipment">
        {vendor.equipment.length === 0 ? (
          <Empty what="equipment" />
        ) : (
          <ul className="divide-y">
            {vendor.equipment.map((e) => (
              <Row key={e.id} title={e.name} sub={[e.category.name, e.model_series].filter(Boolean).join(" · ")}>
                <ProductSpecs specs={e.specs} />
                {(e.standards.length > 0 || e.applications.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {e.standards.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                    {e.applications.map((a) => (
                      <Badge key={a} variant="secondary">
                        {a}
                      </Badge>
                    ))}
                  </div>
                )}
              </Row>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="contacts">
        {!vendor.contacts?.length ? (
          <Empty what="company contacts" />
        ) : (
          <ul className="divide-y">
            {vendor.contacts.map((c) => (
              <Row key={c.id} title={c.label || humanize(c.contact_type)} sub={[humanize(c.contact_type), c.country && countryName(c.country)].filter(Boolean).join(" · ")}>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                      {c.phone}
                    </a>
                  )}
                </div>
              </Row>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="services">
        {vendor.services.length === 0 ? (
          <Empty what="services" />
        ) : (
          <ul className="divide-y">
            {vendor.services.map((s) => (
              <Row
                key={s.id}
                title={s.name}
                sub={[s.category.name, s.equipment_category?.name, s.regions.join(", ")].filter(Boolean).join(" · ")}
              />
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="certifications">
        {vendor.certifications.length === 0 ? (
          <Empty what="certifications" />
        ) : (
          <ul className="divide-y">
            {vendor.certifications.map((c) => (
              <Row
                key={c.id}
                title={
                  <span className="inline-flex items-center gap-1.5">
                    {c.certification.name}
                    {c.verified && <BadgeCheck className="size-4 text-emerald-600" aria-label="Verified" />}
                  </span>
                }
                sub={[
                  c.certificate_number && `No. ${c.certificate_number}`,
                  c.valid_to && `valid until ${c.valid_to}`,
                  c.scope,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="projects">
        {vendor.projects.length === 0 ? (
          <Empty what="reference projects" />
        ) : (
          <ul className="divide-y">
            {vendor.projects.map((p) => (
              <Row
                key={p.id}
                title={p.project_name}
                sub={[p.client, p.operator, p.facility_type, p.country && countryName(p.country), p.year]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {p.scope && <p className="text-sm">{p.scope}</p>}
              </Row>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="locations">
        {vendor.locations.length === 0 ? (
          <Empty what="locations" />
        ) : (
          <ul className="divide-y">
            {vendor.locations.map((l) => (
              <Row
                key={l.id}
                title={humanize(l.location_type)}
                sub={[l.address, l.city, l.country && countryName(l.country)].filter(Boolean).join(", ")}
              />
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="sources">
        {vendor.sources.length === 0 ? (
          <Empty what="sources" />
        ) : (
          <ul className="divide-y">
            {vendor.sources.map((s) => (
              <Row
                key={s.id}
                title={
                  s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">
                      {s.title || s.url} <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    s.title
                  )
                }
                sub={[humanize(s.kind), s.retrieved_at && `retrieved ${formatDateTime(s.retrieved_at)}`]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
