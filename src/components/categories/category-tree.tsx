"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api/client";
import type { CategoryNode } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** The taxonomy tree with per-category counts (vendors in the knowledge base, the organization's equipment lines). */
export function useCategoryTree(enabled = true) {
  return useQuery({
    queryKey: ["categories", "browse"],
    queryFn: () => api<CategoryNode[]>("/categories/browse"),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** Nodes whose name, code or standards match `q`, with the ancestors needed to reach them. */
export function filterTree(nodes: CategoryNode[], q: string): CategoryNode[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return nodes;
  const out: CategoryNode[] = [];
  for (const node of nodes) {
    const self = [node.name, node.code, ...node.standards].some((s) => s.toLowerCase().includes(needle));
    const children = self ? (node.children ?? []) : filterTree(node.children ?? [], q);
    if (self || children.length) out.push({ ...node, children });
  }
  return out;
}

/** Every category in the tree, parents first. */
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children ?? [])]);
}

/**
 * The equipment taxonomy as an expandable tree. Callers add per-node details (`renderMeta`, shown under the name)
 * and controls (`renderActions`, right-aligned). While `expandAll` is set (e.g. when filtering) every branch is open.
 */
export function CategoryTree({
  nodes,
  expandAll = false,
  renderMeta,
  renderActions,
}: {
  nodes: CategoryNode[];
  expandAll?: boolean;
  renderMeta?: (node: CategoryNode) => React.ReactNode;
  renderActions?: (node: CategoryNode) => React.ReactNode;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const renderNodes = (list: CategoryNode[], depth: number): React.ReactNode => (
    <ul className="grid">
      {list.map((node) => {
        const children = node.children ?? [];
        const expanded = expandAll || open.has(node.code);
        return (
          <li key={node.code}>
            <div
              className="flex items-start gap-2 border-b py-2 pr-2 hover:bg-muted/40"
              style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
            >
              {children.length ? (
                <button
                  type="button"
                  className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-expanded={expanded}
                  disabled={expandAll}
                  aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                  onClick={() => toggle(node.code)}
                >
                  <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{node.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
                  {children.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      · {children.length} sub-categor{children.length === 1 ? "y" : "ies"}
                    </span>
                  )}
                </div>
                {node.standards.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {node.standards.map((s) => (
                      <span key={s} className="rounded border bg-muted/50 px-1.5 py-px text-[11px] text-muted-foreground">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {renderMeta?.(node)}
              </div>
              {renderActions && <div className="flex shrink-0 items-center gap-1">{renderActions(node)}</div>}
            </div>
            {children.length > 0 && expanded && renderNodes(children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return <div className="rounded-lg border">{renderNodes(nodes, 0)}</div>;
}
