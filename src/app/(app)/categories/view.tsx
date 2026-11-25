"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { CategoryTree, filterTree, flattenTree, useCategoryTree } from "@/components/categories/category-tree";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryNode } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

function Count({ n, one, many, href }: { n: number; one: string; many: string; href: string }) {
  const text = `${n.toLocaleString()} ${n === 1 ? one : many}`;
  if (!n) return <span className="text-muted-foreground">{text}</span>;
  return (
    <Link href={href} className="text-primary underline-offset-4 hover:underline">
      {text}
    </Link>
  );
}

type Snapshot = Map<string, { name: string; vendors: number; lines: number }>;

function snapshot(nodes: CategoryNode[]): Snapshot {
  return new Map(flattenTree(nodes).map((n) => [n.code, { name: n.name, vendors: n.vendor_count, lines: n.equipment_count }]));
}

const cats = (n: number) => `${n.toLocaleString()} ${n === 1 ? "category" : "categories"}`;
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

/** What changed between two loads of the tree, as short phrases (empty when nothing did). */
function changes(before: Snapshot, after: Snapshot, withLines: boolean): string[] {
  const added = [...after.keys()].filter((c) => !before.has(c));
  const removed = [...before.keys()].filter((c) => !after.has(c));
  let vendorCats = 0,
    vendorDelta = 0,
    lineCats = 0,
    lineDelta = 0;
  for (const [code, now] of after) {
    const was = before.get(code);
    if (!was) continue;
    if (now.vendors !== was.vendors) {
      vendorCats++;
      vendorDelta += now.vendors - was.vendors;
    }
    if (now.lines !== was.lines) {
      lineCats++;
      lineDelta += now.lines - was.lines;
    }
  }
  const out: string[] = [];
  if (added.length) {
    const names = added.length <= 3 ? `: ${added.map((c) => after.get(c)?.name).join(", ")}` : "";
    out.push(`${added.length === 1 ? "1 new category" : `${added.length.toLocaleString()} new categories`}${names}`);
  }
  if (removed.length) out.push(`${cats(removed.length)} removed`);
  if (vendorCats) out.push(`vendor counts changed in ${cats(vendorCats)} (${signed(vendorDelta)} vendors)`);
  if (withLines && lineCats) out.push(`project lines changed in ${cats(lineCats)} (${signed(lineDelta)} lines)`);
  return out;
}

export default function CategoriesPage() {
  const canRead = useCan(P.VENDOR_READ);
  const canEquipment = useCan(P.EQUIPMENT_READ);
  const [q, setQ] = useState("");
  const tree = useCategoryTree(canRead);
  const [checking, setChecking] = useState(false);

  // Reload the tree from the server and say what, if anything, changed since it was last loaded.
  const refresh = async () => {
    const before = snapshot(tree.data ?? []);
    setChecking(true);
    try {
      const r = await tree.refetch();
      if (r.error) throw r.error;
      const diff = changes(before, snapshot(r.data ?? []), canEquipment);
      if (diff.length) toast.success(`Updated: ${diff.join("; ")}.`);
      else toast.info("Up to date: nothing has changed since the last load.");
    } catch (e) {
      toast.error(`Couldn't refresh: ${errorMessage(e)}`);
    } finally {
      setChecking(false);
    }
  };

  if (!canRead) return <NoAccess what="the category browser" />;
  const nodes = filterTree(tree.data ?? [], q);
  const total = flattenTree(tree.data ?? []).length;

  return (
    <>
      <PageHeader
        title="Equipment categories"
        description="The equipment taxonomy, with the vendors that supply each category and your own project history."
        actions={
          <>
            {tree.dataUpdatedAt > 0 && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Checked {new Date(tree.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={checking || tree.isPending}>
              <RefreshCw className={checking ? "animate-spin" : undefined} /> {checking ? "Checking…" : "Refresh"}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filter by name, code or standard"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tree.data && <span className="text-sm text-muted-foreground">{total.toLocaleString()} categories</span>}
      </div>
      {tree.isPending && <Skeleton className="h-64" />}
      {tree.isError && <p className="text-sm text-destructive">{errorMessage(tree.error)}</p>}
      {tree.data &&
        (nodes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No categories match.
          </div>
        ) : (
          <CategoryTree
            nodes={nodes}
            expandAll={Boolean(q.trim())}
            renderMeta={(node) => (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <Count
                  n={node.vendor_count}
                  one="vendor in the knowledge base"
                  many="vendors in the knowledge base"
                  href={`/search?category=${encodeURIComponent(node.code)}`}
                />
                {canEquipment && (
                  <Count
                    n={node.equipment_count}
                    one="line in your projects"
                    many="lines in your projects"
                    href={`/equipment?category=${encodeURIComponent(node.code)}`}
                  />
                )}
              </div>
            )}
          />
        ))}
    </>
  );
}
