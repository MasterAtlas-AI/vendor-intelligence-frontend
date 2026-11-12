"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterSelect } from "@/components/filter-select";
import { FormField } from "@/components/form-field";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { treeItems, useEquipmentCategories } from "@/hooks/use-taxonomy";
import { api } from "@/lib/api/client";
import type { AttributeWrite, EquipmentAttribute } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

const KEY_RE = /^[a-z][a-z0-9_]*$/;

// Mirrors the backend unit conversion: numeric values are stored in these units whatever the MEL uses.
const QUANTITIES: { value: Exclude<AttributeWrite["quantity"], "">; label: string; unit: string }[] = [
  { value: "flow", label: "Flow", unit: "m3/h" },
  { value: "head", label: "Head", unit: "m" },
  { value: "pressure", label: "Pressure", unit: "barg" },
  { value: "temperature", label: "Temperature", unit: "°C" },
  { value: "power", label: "Power", unit: "kW" },
  { value: "mass", label: "Mass", unit: "t" },
  { value: "area", label: "Area", unit: "m2" },
  { value: "voltage", label: "Voltage", unit: "V" },
  { value: "volume", label: "Volume", unit: "m3" },
];
const UNITS_LINE = QUANTITIES.map((q) => `${q.label.toLowerCase()} ${q.unit}`).join(", ");

function useAttributes(enabled: boolean) {
  return useQuery({
    queryKey: ["equipment-attributes"],
    queryFn: () => api<EquipmentAttribute[]>("/equipment-attributes"),
    enabled,
  });
}

function AddAttributeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const categories = useEquipmentCategories();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [quantity, setQuantity] = useState<AttributeWrite["quantity"]>("");
  const [category, setCategory] = useState("");
  const [synonyms, setSynonyms] = useState("");
  const [sortOrder, setSortOrder] = useState("100");

  const autoKey = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 60);
  const effectiveKey = keyEdited ? key : autoKey;
  const keyError = effectiveKey && (effectiveKey.length < 2 || !KEY_RE.test(effectiveKey))
    ? "2+ characters: lowercase letters, digits and underscores, starting with a letter."
    : undefined;

  const create = useMutation({
    mutationFn: () => {
      const body: AttributeWrite = {
        key: effectiveKey,
        label: label.trim(),
        quantity,
        synonyms: [...new Set(synonyms.split("\n").map((s) => s.trim()).filter(Boolean))],
        category_code: category || null,
        sort_order: Number(sortOrder) || 0,
      };
      return api<EquipmentAttribute>("/equipment-attributes", { method: "POST", body });
    },
    onSuccess: (a) => {
      toast.success(`${a.label} added`);
      void queryClient.invalidateQueries({ queryKey: ["equipment-attributes"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an attribute</DialogTitle>
          <DialogDescription>
            A technical value read from MEL columns and shown on your equipment lines.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <FormField id="attr-label" label="Label">
            <Input id="attr-label" placeholder="e.g. NPSH required" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>
          <FormField id="attr-key" label="Key" error={keyError} hint="Used in exports and the API. Can't be changed later.">
            <Input
              id="attr-key"
              className="font-mono"
              value={effectiveKey}
              onChange={(e) => {
                setKey(e.target.value.trim());
                setKeyEdited(true);
              }}
            />
          </FormField>
          <FormField
            id="attr-quantity"
            label="Quantity"
            hint={
              quantity
                ? `Numbers are converted to ${QUANTITIES.find((q) => q.value === quantity)?.unit}.`
                : "Text values are stored as written."
            }
          >
            <FilterSelect
              label="Quantity"
              value={quantity}
              anyLabel="Text (no unit)"
              options={QUANTITIES.map((q) => ({ value: q.value, label: `${q.label} (${q.unit})` }))}
              onChange={(v) => setQuantity(v as AttributeWrite["quantity"])}
              className="w-full"
            />
          </FormField>
          <FormField id="attr-category" label="Applies to">
            <FilterSelect
              label="Applies to"
              value={category}
              anyLabel="All categories"
              options={treeItems(categories.data)}
              onChange={setCategory}
              className="w-full"
            />
          </FormField>
          <FormField
            id="attr-synonyms"
            label="MEL column headers"
            hint="One per line. Columns with these headers are read into this attribute."
          >
            <Textarea
              id="attr-synonyms"
              rows={3}
              placeholder={"NPSHr\nNPSH req."}
              value={synonyms}
              onChange={(e) => setSynonyms(e.target.value)}
            />
          </FormField>
          <FormField id="attr-sort" label="Sort order" hint="Lower numbers are shown first.">
            <Input id="attr-sort" type="number" min={0} max={1000} className="w-32" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!label.trim() || !effectiveKey || Boolean(keyError) || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Adding…" : "Add attribute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AttributesPage() {
  const queryClient = useQueryClient();
  const canRead = useCan(P.EQUIPMENT_READ);
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const attributes = useAttributes(canRead);
  const categories = useEquipmentCategories();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<EquipmentAttribute | null>(null);

  const remove = useMutation({
    mutationFn: (a: EquipmentAttribute) => api(`/equipment-attributes/${a.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Attribute deleted");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["equipment-attributes"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canRead) return <NoAccess what="equipment attributes" />;
  const categoryName = (code: string | null) =>
    code ? (categories.data?.find((c) => c.code === code)?.name ?? code) : "All categories";
  const rows = [...(attributes.data ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
  );

  return (
    <>
      <PageHeader
        title="Equipment attributes"
        description="The technical values read from MEL columns and kept on each equipment line."
        actions={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add attribute
            </Button>
          )
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Numeric values are converted to the unit shown, whatever unit the MEL uses ({UNITS_LINE}).
      </p>
      {attributes.isError && <p className="mb-4 text-sm text-destructive">{errorMessage(attributes.error)}</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attribute</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>MEL column headers</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {attributes.isPending && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {attributes.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No attributes yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {a.label}
                    {a.shared && <Badge variant="secondary">Shared default</Badge>}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{a.key}</div>
                </TableCell>
                <TableCell className="text-sm">{a.data_type === "text" ? "Text" : a.unit || "—"}</TableCell>
                <TableCell className="text-sm">{categoryName(a.category_code)}</TableCell>
                <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">
                  {a.synonyms.join(", ") || "—"}
                </TableCell>
                <TableCell>
                  {canManage && !a.shared && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${a.label}`} onClick={() => setDeleting(a)}>
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {adding && <AddAttributeDialog onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.label}?`}
        description="Future MEL imports stop reading these column headers into it."
        confirmLabel="Delete attribute"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
