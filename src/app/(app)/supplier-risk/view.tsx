"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { usePageParam, useQueryParam } from "@/hooks/use-page-param";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/validation";
import { AVL_LABELS } from "@/lib/vendors";

type RiskPage = components["schemas"]["SupplierRiskPage"];

const PAGE_SIZE = 50;
const LEVEL: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-500/15 text-red-700 dark:text-red-300" },
  medium: { label: "Medium", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
};

/** SOW 29.9: the organization's vendors with risk signals, riskiest first, each with its reasons. */
export default function SupplierRiskPage() {
  const canRead = useCan(P.VENDOR_READ);
  const hasTenant = useAuth((s) => Boolean(s.user?.tenant || s.actAs));
  const router = useRouter();
  const pathname = usePathname();
  const [levelParam] = useQueryParam("level", "medium");
  const level = ["high", "medium", "low"].includes(levelParam) ? levelParam : "medium";
  const [page, setPage] = usePageParam();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const risk = useQuery({
    queryKey: ["supplier-risk", level, q, page],
    queryFn: () => api<RiskPage>("/supplier-risk", { query: { min_level: level, q: q || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
    placeholderData: (previous) => previous,
    enabled: canRead && hasTenant,
  });
  if (!canRead || !hasTenant) return <NoAccess what="supplier risk for an organization" />;
  const d = risk.data;

  return (
    <>
      <PageHeader
        title="Supplier risk"
        description="Vendors on your list with warning signs: lapsed certificates, late or poorly rated orders, failed technical evaluations, heavy dependence, stale data. Each flag says why."
      />
      {d && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          {(["high", "medium", "low"] as const).map((l) => (
            <Card key={l}>
              <CardHeader>
                <CardDescription>{LEVEL[l]!.label} risk</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{(d.counts[l] ?? 0).toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search vendors"
            placeholder="Vendor name"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FilterSelect
          label="Show"
          anyLabel="High and medium"
          value={level === "medium" ? "" : level}
          onChange={(v) => {
            const query = new URLSearchParams(window.location.search);
            if (v) query.set("level", v);
            else query.delete("level");
            query.delete("page");
            router.replace(query.toString() ? `${pathname}?${query}` : pathname, { scroll: false });
          }}
          options={[
            { value: "high", label: "High only" },
            { value: "low", label: "All levels" },
          ]}
          className="w-44"
        />
      </div>
      {risk.isError && <p className="text-sm text-destructive">{errorMessage(risk.error)}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead className="w-24">Risk</TableHead>
              <TableHead>Why</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {risk.isPending && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {d?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  {q ? "No vendor matches." : "No vendors with warning signs at this level."}
                </TableCell>
              </TableRow>
            )}
            {d?.items.map((r) => (
              <TableRow key={r.vendor_id}>
                <TableCell className="align-top">
                  <Link href={`/vendors/${r.vendor_id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{AVL_LABELS[r.avl_status]}</div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge className={LEVEL[r.level]!.className}>{LEVEL[r.level]!.label}</Badge>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <ul className="grid gap-1 text-sm">
                    {r.factors.map((f) => (
                      <li key={f.key}>
                        <span className="font-medium">{f.label}</span>
                        <span className="text-muted-foreground">: {f.detail}</span>
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={d?.total}
        loading={risk.isFetching}
        onPage={(p) => {
          setPage(p);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </>
  );
}
