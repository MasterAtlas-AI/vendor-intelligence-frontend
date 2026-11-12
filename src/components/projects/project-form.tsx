"use client";

import { FilterSelect } from "@/components/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectRead } from "@/lib/api/types";

import { PROJECT_KINDS, PROJECT_LOCATIONS } from "./shared";

export interface ProjectFormValues {
  name: string;
  code: string;
  client: string;
  facility_type: string;
  country: string;
  description: string;
  kind: ProjectRead["kind"];
  year: string;
  location: string;
}

export const EMPTY_PROJECT: ProjectFormValues = {
  name: "",
  code: "",
  client: "",
  facility_type: "",
  country: "",
  description: "",
  kind: "sourcing",
  year: "",
  location: "",
};

export function projectToForm(p: ProjectRead): ProjectFormValues {
  return {
    name: p.name,
    code: p.code ?? "",
    client: p.client ?? "",
    facility_type: p.facility_type ?? "",
    country: p.country ?? "",
    description: p.description ?? "",
    kind: p.kind ?? "sourcing",
    year: p.year ? String(p.year) : "",
    location: p.location ?? "",
  };
}

/** The request body for POST /projects or PATCH /projects/{id} (blank text -> null). */
export function formToBody(form: ProjectFormValues) {
  const text = (v: string) => v.trim() || null;
  const year = Number.parseInt(form.year, 10);
  return {
    name: form.name.trim(),
    code: text(form.code),
    client: text(form.client),
    facility_type: text(form.facility_type),
    country: text(form.country),
    description: form.description.trim(),
    kind: form.kind,
    year: Number.isFinite(year) ? year : null,
    location: (form.location || null) as ProjectRead["location"],
  };
}

export function yearInvalid(form: ProjectFormValues): boolean {
  if (!form.year.trim()) return false;
  const y = Number(form.year);
  return !Number.isInteger(y) || y < 1900 || y > 2100;
}

/** Name, numbers, client, facility, kind, year, location and description. */
export function ProjectFields({ form, onChange }: { form: ProjectFormValues; onChange: (form: ProjectFormValues) => void }) {
  const field = (key: "name" | "code" | "client" | "facility_type" | "country", label: string, placeholder = "") => (
    <div className="grid gap-1.5">
      <Label htmlFor={`project-${key}`}>{label}</Label>
      <Input id={`project-${key}`} placeholder={placeholder} value={form[key]} onChange={(e) => onChange({ ...form, [key]: e.target.value })} />
    </div>
  );
  const kind = PROJECT_KINDS.find((k) => k.value === form.kind);
  return (
    <div className="grid gap-3">
      {field("name", "Name", "e.g. Water injection pumps - FPSO Bacalhau")}
      <div className="grid gap-1.5">
        <Label>Kind</Label>
        <FilterSelect
          label="Project kind"
          anyLabel="Sourcing"
          value={form.kind === "sourcing" ? "" : form.kind}
          onChange={(v) => onChange({ ...form, kind: (v || "sourcing") as ProjectRead["kind"] })}
          options={PROJECT_KINDS.filter((k) => k.value !== "sourcing")}
          className="w-full"
        />
        {kind && <p className="text-xs text-muted-foreground">{kind.hint}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("code", "Project number")}
        {field("client", "Client / operator")}
        {field("facility_type", "Facility", "FPSO, refinery, LNG…")}
        {field("country", "Country")}
        <div className="grid gap-1.5">
          <Label htmlFor="project-year">Year</Label>
          <Input
            id="project-year"
            inputMode="numeric"
            placeholder="e.g. 2019"
            value={form.year}
            aria-invalid={yearInvalid(form) || undefined}
            onChange={(e) => onChange({ ...form, year: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Location</Label>
          <FilterSelect
            label="Location"
            anyLabel="Not set"
            value={form.location}
            onChange={(v) => onChange({ ...form, location: v })}
            options={[...PROJECT_LOCATIONS]}
            className="w-full"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="project-description">Description</Label>
        <Textarea id="project-description" rows={3} value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} />
      </div>
    </div>
  );
}
