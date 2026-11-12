"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CategoryTree, filterTree, flattenTree, useCategoryTree } from "@/components/categories/category-tree";
import { FormField } from "@/components/form-field";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useEquipmentCategories } from "@/hooks/use-taxonomy";
import { api } from "@/lib/api/client";
import type { CategoryNode, EquipmentCategory } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/** One entry per line (commas also separate), blanks dropped, duplicates removed. */
function parseList(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

type DialogState = { mode: "create"; parent: CategoryNode | null } | { mode: "edit"; node: CategoryNode };

function CategoryDialog({
  state,
  flat,
  onClose,
}: {
  state: DialogState;
  flat: EquipmentCategory[] | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = state.mode === "edit" ? flat?.find((c) => c.code === state.node.code) : undefined;
  const parent = state.mode === "create" ? state.parent : null;
  const [key, setKey] = useState("");
  const [name, setName] = useState(state.mode === "edit" ? state.node.name : "");
  const [description, setDescription] = useState("");
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [synonyms, setSynonyms] = useState((editing?.synonyms ?? []).join("\n"));
  const [standards, setStandards] = useState(
    (editing?.standards ?? (state.mode === "edit" ? state.node.standards : [])).join(", "),
  );

  const keyError = key && (key.length < 2 || !KEY_RE.test(key))
    ? "2+ characters: lowercase letters, digits and underscores, starting with a letter."
    : undefined;
  const code = parent ? `${parent.code}.${key || "…"}` : key || "…";

  const save = useMutation({
    mutationFn: () => {
      if (state.mode === "edit") {
        if (!editing) throw new Error("Category not found. Reload the page and try again.");
        return api<EquipmentCategory>(`/taxonomy/equipment-categories/${editing.id}`, {
          method: "PATCH",
          body: {
            name: name.trim(),
            synonyms: parseList(synonyms),
            standards: parseList(standards),
            ...(descriptionTouched ? { description: description.trim() } : {}),
          },
        });
      }
      return api<EquipmentCategory>("/taxonomy/equipment-categories", {
        method: "POST",
        body: {
          parent_code: parent?.code ?? null,
          key,
          name: name.trim(),
          description: description.trim(),
          synonyms: parseList(synonyms),
          standards: parseList(standards),
        },
      });
    },
    onSuccess: (c) => {
      toast.success(state.mode === "edit" ? `${c.name} updated` : `${c.name} added as ${c.code}`);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const valid = name.trim().length > 0 && (state.mode === "edit" ? Boolean(editing) : key.length >= 2 && !keyError);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state.mode === "edit"
              ? `Edit ${state.node.name}`
              : parent
                ? `Add a sub-category under ${parent.name}`
                : "Add a top-level category"}
          </DialogTitle>
          <DialogDescription>
            Categories are shared by every organization. A category&apos;s code is permanent once created; its name,
            synonyms and standards can change later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          {state.mode === "create" ? (
            <FormField
              id="cat-key"
              label="Key"
              error={keyError}
              hint="Lowercase letters, digits and underscores, e.g. centrifugal_pump."
            >
              <Input id="cat-key" value={key} onChange={(e) => setKey(e.target.value.trim())} />
              <p className="text-xs text-muted-foreground">
                Code: <span className="font-mono">{code}</span>
              </p>
            </FormField>
          ) : (
            <FormField id="cat-code" label="Code" hint="Codes can't be changed.">
              <Input id="cat-code" value={state.node.code} readOnly disabled className="font-mono" />
            </FormField>
          )}
          <FormField id="cat-name" label="Name">
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField
            id="cat-description"
            label="Description"
            hint={
              state.mode === "edit"
                ? "Leave untouched to keep the current description; anything typed here replaces it."
                : "Optional. Helps the AI classify vendors and equipment into this category."
            }
          >
            <Textarea
              id="cat-description"
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionTouched(true);
              }}
            />
          </FormField>
          <FormField id="cat-synonyms" label="Synonyms" hint="One per line. Other names for this equipment, used for matching.">
            <Textarea id="cat-synonyms" rows={3} value={synonyms} onChange={(e) => setSynonyms(e.target.value)} />
          </FormField>
          <FormField id="cat-standards" label="Standards" hint="Comma-separated, e.g. API 610, ISO 13709.">
            <Input id="cat-standards" value={standards} onChange={(e) => setStandards(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : state.mode === "edit" ? "Save" : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TaxonomyAdminPage() {
  const canManage = useCan(P.TAXONOMY_MANAGE);
  const tree = useCategoryTree(canManage);
  const flat = useEquipmentCategories();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);

  if (!canManage) return <NoAccess what="taxonomy administration" />;
  const nodes = filterTree(tree.data ?? [], q);

  return (
    <>
      <PageHeader
        title="Taxonomy"
        description="The equipment categories every organization classifies vendors and project equipment into."
        actions={
          <Button onClick={() => setDialog({ mode: "create", parent: null })}>
            <Plus /> Add category
          </Button>
        }
      />
      <Alert className="mb-4">
        <AlertDescription>
          Codes are permanent once created (they are stored on vendors and equipment). Rename a category instead of
          re-creating it.
        </AlertDescription>
      </Alert>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filter by name, code or standard"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tree.data && (
          <span className="text-sm text-muted-foreground">{flattenTree(tree.data).length.toLocaleString()} categories</span>
        )}
      </div>
      {tree.isPending && <Skeleton className="h-64" />}
      {tree.isError && <p className="text-sm text-destructive">{errorMessage(tree.error)}</p>}
      {tree.data &&
        (nodes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            {q.trim() ? "No categories match." : "No categories yet."}
          </div>
        ) : (
          <CategoryTree
            nodes={nodes}
            expandAll={Boolean(q.trim())}
            renderMeta={(node) => {
              const synonyms = flat.data?.find((c) => c.code === node.code)?.synonyms ?? [];
              return synonyms.length ? (
                <div className="text-xs text-muted-foreground">Also known as: {synonyms.join(", ")}</div>
              ) : null;
            }}
            renderActions={(node) => (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Add a sub-category under ${node.name}`}
                  onClick={() => setDialog({ mode: "create", parent: node })}
                >
                  <Plus /> Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${node.name}`}
                  disabled={!flat.data}
                  onClick={() => setDialog({ mode: "edit", node })}
                >
                  <Pencil /> Edit
                </Button>
              </>
            )}
          />
        ))}

      {dialog && (
        <CategoryDialog
          key={dialog.mode === "edit" ? dialog.node.code : `new-${dialog.parent?.code ?? ""}`}
          state={dialog}
          flat={flat.data}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
