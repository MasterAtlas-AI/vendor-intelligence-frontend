"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { LoadMore } from "@/components/load-more";
import { AiFillBar, MAX_AI_SELECTED } from "@/components/quality/ai-fill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VendorTable } from "@/components/vendors/vendor-table";
import { useDebounced } from "@/hooks/use-debounced";
import {
  treeItems,
  useCertificationTypes,
  useEquipmentCategories,
  useIndustries,
  useServiceCategories,
} from "@/hooks/use-taxonomy";
import { api } from "@/lib/api/client";
import type { VendorPage } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/validation";
import { AVL_OPTIONS } from "@/lib/vendors";

interface Filters {
  q: string;
  country: string;
  equipment_category: string;
  service_category: string;
  certification: string;
  industry: string;
  avl_status: string;
}

const EMPTY: Filters = {
  q: "",
  country: "",
  equipment_category: "",
  service_category: "",
  certification: "",
  industry: "",
  avl_status: "",
};

/** Vendor search over the global knowledge base. `mine` limits it to the organization's own list; `aiFill` lets
 *  curators tick vendors and have the AI look up missing details or research websites, approving results in place. */
export function VendorSearch({ mine = false, aiFill = false }: { mine?: boolean; aiFill?: boolean }) {
  const user = useAuth((s) => s.user);
  const actAs = useAuth((s) => s.actAs);
  const hasTenant = Boolean(user?.tenant || actAs);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = useDebounced(filters.q.trim(), 300);
  const country = useDebounced(filters.country.trim(), 300);
  const query = { ...filters, q, country };

  const equipment = useEquipmentCategories();
  const services = useServiceCategories();
  const certifications = useCertificationTypes();
  const industries = useIndustries();

  const vendors = useInfiniteQuery({
    queryKey: ["vendors", "search", actAs?.id, mine, query],
    queryFn: ({ pageParam, signal }) =>
      api<VendorPage>("/vendors", {
        query: { ...query, mine: mine || undefined, limit: 25, cursor: pageParam },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const rows = vendors.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = Object.values(filters).some(Boolean);
  const toggle = (id: string, on: boolean) => {
    if (on && selected.size >= MAX_AI_SELECTED) {
      toast.error(`Up to ${MAX_AI_SELECTED} vendors at a time`);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAll = (on: boolean) => setSelected(on ? new Set(rows.slice(0, MAX_AI_SELECTED).map((v) => v.id)) : new Set());

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search vendors"
            placeholder="Name, alias, website or description"
            className="pl-8"
            value={filters.q}
            onChange={(e) => set("q")(e.target.value)}
          />
        </div>
        <Input
          aria-label="Country"
          placeholder="Country"
          className="w-36"
          value={filters.country}
          onChange={(e) => set("country")(e.target.value)}
        />
        <FilterSelect
          label="Equipment category"
          anyLabel="Any equipment"
          value={filters.equipment_category}
          onChange={set("equipment_category")}
          options={treeItems(equipment.data)}
          className="w-56"
        />
        <FilterSelect
          label="Service category"
          anyLabel="Any service"
          value={filters.service_category}
          onChange={set("service_category")}
          options={treeItems(services.data)}
        />
        <FilterSelect
          label="Certification"
          anyLabel="Any certification"
          value={filters.certification}
          onChange={set("certification")}
          options={(certifications.data ?? []).map((c) => ({ value: c.code, label: c.name }))}
        />
        <FilterSelect
          label="Industry"
          anyLabel="Any industry"
          value={filters.industry}
          onChange={set("industry")}
          options={(industries.data ?? []).map((i) => ({ value: i.code, label: i.name }))}
        />
        {hasTenant && (
          <FilterSelect
            label="Your approval status"
            anyLabel={mine ? "Any status" : "Any of your statuses"}
            value={filters.avl_status}
            onChange={set("avl_status")}
            options={AVL_OPTIONS}
            className="w-44"
          />
        )}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
            <X /> Clear filters
          </Button>
        )}
      </div>
      {aiFill && rows.length > 0 && (
        <div className="mb-4 grid gap-4">
          <AiFillBar
            selected={[...selected]}
            actions={["website", "hq_country", "description", "contacts", "research"]}
            onStarted={() => setSelected(new Set())}
            hint={`Tick up to ${MAX_AI_SELECTED} vendors to look up missing websites, headquarters, descriptions or contact details, or research their websites.`}
          />
        </div>
      )}
      {vendors.isError ? (
        <p className="text-sm text-destructive">{errorMessage(vendors.error)}</p>
      ) : (
        <VendorTable
          rows={rows}
          loading={vendors.isPending}
          showOwnFields={hasTenant}
          selection={aiFill ? { selected, onToggle: toggle, onToggleAll: toggleAll } : undefined}
          empty={
            filtered
              ? "No vendors match these filters."
              : mine
                ? "Your list is empty. Add vendors from their page, or import your vendor list."
                : "The knowledge base has no vendors yet. Import a vendor list, or approve proposals, to add some."
          }
        />
      )}
      <LoadMore
        hasNextPage={vendors.hasNextPage}
        isFetchingNextPage={vendors.isFetchingNextPage}
        fetchNextPage={vendors.fetchNextPage}
      />
    </>
  );
}
