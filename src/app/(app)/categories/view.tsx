"use client";

import Link from "next/link";
import { useState } from "react";

import { CategoryTree, filterTree, flattenTree, useCategoryTree } from "@/components/categories/category-tree";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function CategoriesPage() {
  const canRead = useCan(P.VENDOR_READ);
  const canEquipment = useCan(P.EQUIPMENT_READ);
  const [q, setQ] = useState("");
  const tree = useCategoryTree(canRead);

  if (!canRead) return <NoAccess what="the category browser" />;
  const nodes = filterTree(tree.data ?? [], q);
  const total = flattenTree(tree.data ?? []).length;

  return (
    <>
      <PageHeader
        title="Equipment categories"
        description="The equipment taxonomy, with the vendors that supply each category and your own project history."
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
