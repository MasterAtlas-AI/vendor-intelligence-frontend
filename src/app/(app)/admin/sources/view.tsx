"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { P, useCan } from "@/lib/auth/permissions";
import { humanize, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/validation";

type SourceRegister = components["schemas"]["SourceRegister"];
type SourceGroup = components["schemas"]["SourceGroup"];

const RELIABILITY = [
  { value: "0.9", label: "High" },
  { value: "0.6", label: "Medium" },
  { value: "0.3", label: "Low" },
];

const KINDS = [
  { value: "web", label: "Web pages" },
  { value: "document", label: "Documents" },
  { value: "excel", label: "Excel imports" },
  { value: "manual", label: "Manual entry" },
  { value: "ai", label: "AI research" },
];

/** SOW 24.4: the source register. Curators rate a whole domain (or kind) at once; facts are never changed here. */
export default function SourcesPage() {
  const canCurate = useCan(P.KNOWLEDGE_APPROVE);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [kind, setKind] = useState("");
  const register = useQuery({
    queryKey: ["source-register", q, kind],
    queryFn: () => api<SourceRegister>("/admin/sources", { query: { q, kind: kind || undefined, limit: 300 } }),
    enabled: canCurate,
    placeholderData: (previous) => previous,
  });
  const rate = useMutation({
    mutationFn: ({ group, value }: { group: SourceGroup; value: string }) =>
      api<{ updated: number }>("/admin/sources/reliability", {
        method: "PUT",
        body: { kind: group.kind, key: group.key, reliability: value ? Number(value) : null },
      }),
    onSuccess: (r, { group }) => {
      toast.success(`${group.key}: ${r.updated} source${r.updated === 1 ? "" : "s"} updated`);
      void queryClient.invalidateQueries({ queryKey: ["source-register"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canCurate) return <NoAccess what="the source register" />;
  const data = register.data;

  return (
    <>
      <PageHeader
        title="Data sources"
        description="Where the knowledge base's facts come from, grouped by website or kind. Rate a source's reliability; it shows beside each citation. Wrong facts are corrected through Approvals, not here."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search sources" placeholder="Domain, e.g. flowserve.com" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterSelect label="Kind" anyLabel="All kinds" value={kind} onChange={setKind} options={KINDS} className="w-44" />
        {data && <span className="text-sm text-muted-foreground">{data.total.toLocaleString()} sources</span>}
      </div>
      {register.isError && <p className="text-sm text-destructive">{errorMessage(register.error)}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Facts</TableHead>
              <TableHead className="text-right">Vendors</TableHead>
              <TableHead className="text-right">Pages / files</TableHead>
              <TableHead>Last retrieved</TableHead>
              <TableHead>Reliability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {register.isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {data?.groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No sources match.
                </TableCell>
              </TableRow>
            )}
            {data?.groups.map((g) => (
              <TableRow key={`${g.kind}:${g.key}`}>
                <TableCell>
                  <div className="font-medium">{g.kind === "web" ? g.key : humanize(g.kind)}</div>
                  <div className="text-xs text-muted-foreground">{KINDS.find((k) => k.value === g.kind)?.label}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{g.facts.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{g.vendors.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{g.sources.toLocaleString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{g.last_retrieved ? timeAgo(g.last_retrieved) : "—"}</TableCell>
                <TableCell>
                  <FilterSelect
                    label={`Reliability of ${g.key}`}
                    anyLabel={g.reliability === null ? "Not rated / mixed" : "Not rated"}
                    value={g.reliability === null ? "" : (RELIABILITY.find((r) => Math.abs(Number(r.value) - Number(g.reliability)) < 0.01)?.value ?? "")}
                    onChange={(value) => rate.mutate({ group: g, value })}
                    options={RELIABILITY}
                    className="w-40"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
