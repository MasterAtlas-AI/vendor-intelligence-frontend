"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attributeLabel, attributeText, defsForCategory, parseNumeric, useAttributeDefs, useCategoryOptions } from "@/components/equipment/shared";
import { FilterSelect } from "@/components/filter-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { Equipment } from "@/lib/api/types";
import { DEPARTMENTS, EQUIPMENT_STATUSES, VERIFICATION, attributeIndex } from "@/lib/history";
import { errorMessage } from "@/lib/validation";

type EquipmentUpdate = components["schemas"]["EquipmentUpdate"];

interface AttrRow {
  key: string;
  value: string;
}

/** Edit one equipment record (equipment:manage). The record's version guards against overwriting someone else's change. */
export function EditEquipmentDialog({ open, onOpenChange, equipment }: { open: boolean; onOpenChange: (o: boolean) => void; equipment: Equipment }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit equipment</DialogTitle>
          <DialogDescription>Changes are recorded in the audit log. Marking a record verified means you have checked it.</DialogDescription>
        </DialogHeader>
        {/* Remounted per open (and per version) so the form always starts from the saved record. */}
        {open && <EditForm key={equipment.version} equipment={equipment} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ equipment: e, onDone }: { equipment: Equipment; onDone: () => void }) {
  const queryClient = useQueryClient();
  const defs = useAttributeDefs();
  const index = attributeIndex(defs.data);
  const categories = useCategoryOptions();
  const [name, setName] = useState(e.name);
  const [tag, setTag] = useState(e.tag);
  const [service, setService] = useState(e.service);
  const [model, setModel] = useState(e.model);
  const [quantity, setQuantity] = useState(String(e.quantity));
  const [vendorName, setVendorName] = useState(e.vendor_name);
  const [manufacturerName, setManufacturerName] = useState(e.manufacturer_name);
  const [category, setCategory] = useState(e.category_code ?? "");
  const [department, setDepartment] = useState(e.department ?? "");
  const [status, setStatus] = useState<string>(e.status ?? "");
  const [verification, setVerification] = useState<string>(e.verification);
  const [standards, setStandards] = useState(e.standards.join(", "));
  const [specs, setSpecs] = useState(e.specs_text);
  const [notes, setNotes] = useState(e.notes);
  const [attrs, setAttrs] = useState<AttrRow[]>(Object.entries(e.attributes ?? {}).map(([key, v]) => ({ key, value: attributeText(v) })));
  const used = new Set(attrs.map((a) => a.key));
  const available = defsForCategory(defs.data ?? [], category);

  const build = (): EquipmentUpdate | string => {
    const attributes: Record<string, number | number[] | string> = {};
    for (const a of attrs) {
      if (!a.key || !a.value.trim()) continue;
      const def = index[a.key];
      if (def?.data_type === "text") {
        attributes[a.key] = a.value.trim();
        continue;
      }
      const parsed = parseNumeric(a.value);
      if (parsed === null) {
        if (def) return `${def.label} must be a number or a range like 20 - 1200`;
        attributes[a.key] = a.value.trim();
      } else attributes[a.key] = parsed;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return "Quantity must be a whole number of at least 1";
    return {
      version: e.version,
      name: name.trim(),
      tag: tag.trim(),
      service: service.trim(),
      model: model.trim(),
      quantity: qty,
      vendor_name: vendorName.trim(),
      manufacturer_name: manufacturerName.trim(),
      category_code: category || null,
      department: (department || null) as EquipmentUpdate["department"],
      status: (status || null) as EquipmentUpdate["status"],
      verification: verification as EquipmentUpdate["verification"],
      standards: standards
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      specs_text: specs,
      notes,
      attributes,
    };
  };

  const save = useMutation({
    mutationFn: (body: EquipmentUpdate) => api<Equipment>(`/equipment/${e.id}`, { method: "PATCH", body }),
    onSuccess: (updated) => {
      toast.success("Equipment updated");
      queryClient.setQueryData(["equipment", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["equipment", "search"] });
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Someone else changed this record. Reloaded the latest version; please re-apply your edits.");
        void queryClient.invalidateQueries({ queryKey: ["equipment", e.id] });
        onDone();
      } else toast.error(errorMessage(err));
    },
  });
  const submit = () => {
    const body = build();
    if (typeof body === "string") toast.error(body);
    else save.mutate(body);
  };

  return (
    <>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="eq-name">Description</Label>
            <Input id="eq-name" value={name} onChange={(ev) => setName(ev.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-tag">Tag</Label>
            <Input id="eq-tag" value={tag} onChange={(ev) => setTag(ev.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-service">Service</Label>
            <Input id="eq-service" value={service} onChange={(ev) => setService(ev.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-model">Model</Label>
            <Input id="eq-model" value={model} onChange={(ev) => setModel(ev.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-vendor">Vendor</Label>
            <Input id="eq-vendor" value={vendorName} onChange={(ev) => setVendorName(ev.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-manufacturer">Manufacturer</Label>
            <Input id="eq-manufacturer" value={manufacturerName} onChange={(ev) => setManufacturerName(ev.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-qty">Quantity</Label>
            <Input id="eq-qty" inputMode="numeric" value={quantity} onChange={(ev) => setQuantity(ev.target.value)} />
          </div>
          {categories.available && (
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <FilterSelect label="Category" anyLabel="No category" value={category} onChange={setCategory} options={categories.options} className="w-full" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Department</Label>
            <FilterSelect
              label="Department"
              anyLabel="No department"
              value={department}
              onChange={setDepartment}
              options={DEPARTMENTS.map(([value, label]) => ({ value, label }))}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Equipment status</Label>
            <FilterSelect
              label="Equipment status"
              anyLabel="Not set"
              value={status}
              onChange={setStatus}
              options={EQUIPMENT_STATUSES.map(([value, label]) => ({ value, label }))}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Verification</Label>
            <FilterSelect
              label="Verification"
              anyLabel={VERIFICATION[e.verification].label}
              value={verification === e.verification ? "" : verification}
              onChange={(v) => setVerification(v || e.verification)}
              options={Object.entries(VERIFICATION)
                .filter(([value]) => value !== e.verification && value !== "archived")
                .map(([value, v]) => ({ value, label: v.label }))}
              className="w-full"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="eq-standards">Standards</Label>
          <Input id="eq-standards" placeholder="Comma-separated" value={standards} onChange={(ev) => setStandards(ev.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Technical data</Label>
          <p className="text-xs text-muted-foreground">Numbers in the attribute&apos;s unit; a range as &quot;20 - 1200&quot;.</p>
          {attrs.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {index[a.key] || !a.key ? (
                <FilterSelect
                  label="Attribute"
                  anyLabel="Choose an attribute"
                  value={a.key}
                  onChange={(key) => setAttrs((rows) => rows.map((r, j) => (j === i ? { ...r, key } : r)))}
                  options={available.filter((d) => d.key === a.key || !used.has(d.key)).map((d) => ({ value: d.key, label: attributeLabel(d, d.key) }))}
                  className="w-56"
                />
              ) : (
                <span className="w-56 truncate text-sm text-muted-foreground" title={a.key}>
                  {a.key}
                </span>
              )}
              <Input
                aria-label={`Value for ${index[a.key]?.label ?? a.key}`}
                className="w-40"
                value={a.value}
                onChange={(ev) => setAttrs((rows) => rows.map((r, j) => (j === i ? { ...r, value: ev.target.value } : r)))}
              />
              {index[a.key]?.unit && <span className="text-sm text-muted-foreground">{index[a.key].unit}</span>}
              <Button variant="ghost" size="icon-sm" aria-label="Remove attribute" onClick={() => setAttrs((rows) => rows.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" onClick={() => setAttrs((rows) => [...rows, { key: "", value: "" }])}>
              <Plus /> Add value
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="eq-specs">Specification text</Label>
          <Textarea id="eq-specs" rows={3} value={specs} onChange={(ev) => setSpecs(ev.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="eq-notes">Notes</Label>
          <Textarea id="eq-notes" rows={2} value={notes} onChange={(ev) => setNotes(ev.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={save.isPending || !name.trim()} onClick={submit}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
