"use client";

import { useState } from "react";

import { EquipmentSearch } from "@/components/equipment/equipment-search";
import { NearFit } from "@/components/equipment/near-fit";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { P, useCan } from "@/lib/auth/permissions";

export default function EquipmentPage() {
  const canRead = useCan(P.EQUIPMENT_READ);
  const [tab, setTab] = useState<"search" | "near-fit">("search");
  if (!canRead) return <NoAccess what="the equipment history" />;
  return (
    <>
      <PageHeader
        title="Equipment history"
        description="Equipment from the organization's own projects (MELs, POs, datasheets): search it, or find the closest past match for a new duty."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as "search" | "near-fit")} className="mb-4">
        <TabsList>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="near-fit">Near-fit</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* Both stay mounted so switching tabs keeps filters and results. */}
      <div hidden={tab !== "search"}>
        <EquipmentSearch />
      </div>
      <div hidden={tab !== "near-fit"}>
        <NearFit />
      </div>
    </>
  );
}
