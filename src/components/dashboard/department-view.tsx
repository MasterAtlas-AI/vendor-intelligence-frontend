"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { type HistoryPanel, HistoryPanels } from "@/components/analytics/history-panels";
import { FilterSelect } from "@/components/filter-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { OrganizationAnalytics } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { DEPARTMENTS, type Department } from "@/lib/history";

type View = { links: [string, string, string][]; panels: HistoryPanel[]; focus: string };

// What each department usually looks for (SOW 14); views overlap, as the SOW expects.
const LINK = {
  equipment: ["/equipment", "Equipment history", "Previous selections, ratings, weight and footprint"],
  categories: ["/categories", "Category browser", "Vendors and your equipment by category"],
  assistant: ["/assistant", "Assistant", "Ask in plain words; knowledge base and web"],
  search: ["/search", "Vendor search", "Filter by standard, category, country, use on your projects"],
  myVendors: ["/my-vendors", "My vendors", "Qualification (AVL) status of your vendors"],
  rfqs: ["/rfqs", "RFQs", "Quotations and lead times"],
  projects: ["/projects", "Projects", "Project history, MELs, purchase orders, lessons learned"],
  analytics: ["/analytics", "Analytics", "Cross-project vendor and equipment intelligence"],
  reports: ["/reports", "Reports", "Comparisons and vendor lists as PDF or Excel"],
} satisfies Record<string, [string, string, string]>;

const VIEWS: Record<Department | "general", View> = {
  engineering: { links: [LINK.equipment, LINK.categories, LINK.assistant], panels: ["categories", "years"], focus: "Previous equipment selections and alternatives" },
  procurement: { links: [LINK.search, LINK.myVendors, LINK.rfqs], panels: ["vendors", "performance", "long_lead"], focus: "Vendors, qualification and supply history" },
  planning: { links: [LINK.projects, LINK.equipment, LINK.reports], panels: ["long_lead", "performance"], focus: "Lead times and delivery records" },
  project_management: { links: [LINK.projects, LINK.analytics, LINK.rfqs], panels: ["totals", "vendors", "performance"], focus: "Vendor engagement and cross-project comparison" },
  operations: { links: [LINK.equipment, LINK.projects, LINK.assistant], panels: ["categories"], focus: "Installed equipment, OEM details and feedback" },
  construction: { links: [LINK.equipment, LINK.projects], panels: ["categories", "long_lead"], focus: "Equipment and delivery status" },
  commissioning: { links: [LINK.equipment, LINK.projects], panels: ["categories"], focus: "Installed equipment and lessons learned" },
  qa_qc: { links: [LINK.search, LINK.projects], panels: ["performance"], focus: "Certifications and vendor performance" },
  hse: { links: [LINK.search, LINK.projects], panels: ["categories"], focus: "Safety equipment and lessons learned" },
  supply_chain: { links: [LINK.search, LINK.rfqs, LINK.myVendors], panels: ["vendors", "long_lead", "performance"], focus: "Supply history and lead times" },
  management: { links: [LINK.analytics, LINK.reports, LINK.assistant], panels: ["totals", "vendors", "categories", "years"], focus: "Strategic vendor and equipment intelligence" },
  business_development: { links: [LINK.analytics, LINK.categories, LINK.assistant], panels: ["totals", "categories", "years"], focus: "References and capabilities across projects" },
  marketing: { links: [LINK.analytics, LINK.categories], panels: ["totals", "categories", "years"], focus: "Project references and experience" },
  document_control: { links: [LINK.projects, LINK.equipment], panels: ["totals"], focus: "MELs, documents and their sources" },
  general: { links: [LINK.search, LINK.assistant, LINK.projects], panels: ["totals", "categories", "vendors"], focus: "Everyday vendor and equipment search" },
};

const OPTIONS = DEPARTMENTS.map(([value, label]) => ({ value, label }));

/** The dashboard's department view: the links and project-history panels each department usually needs. Defaults to
 *  the user's department (My profile), and can be switched here without changing the profile. */
export function DepartmentView() {
  const user = useAuth((s) => s.user)!;
  const actAs = useAuth((s) => s.actAs);
  const canAnalytics = useCan(P.REPORT_READ) && Boolean(user.tenant || actAs);
  const canHistory = useCan(P.EQUIPMENT_READ);
  const [picked, setPicked] = useState("");
  const department = (picked || user.department || "") as Department | "";
  const view = VIEWS[department || "general"];
  const data = useQuery({
    queryKey: ["analytics", actAs?.id, "90"],
    queryFn: () => api<OrganizationAnalytics>("/analytics", { query: { days: "90" } }),
    enabled: canAnalytics && canHistory,
  });

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">For your department</h2>
          <p className="text-sm text-muted-foreground">{view.focus}</p>
        </div>
        <FilterSelect label="Department view" anyLabel="General view" value={department} onChange={setPicked} options={OPTIONS} className="w-56" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {view.links.map(([href, title, hint]) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-1 text-base">
                  {title} <ArrowRight className="size-3.5 opacity-60 group-hover:translate-x-0.5" />
                </CardTitle>
                <CardDescription>{hint}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      {canAnalytics && canHistory && (
        <>
          {data.isPending && <Skeleton className="h-40" />}
          {data.data && <HistoryPanels h={data.data.history} panels={view.panels} />}
        </>
      )}
      {!user.department && !picked && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Set your department in{" "}
            <Link href="/settings/profile" className="text-primary hover:underline">
              My profile
            </Link>{" "}
            to open this view by default.
          </CardContent>
        </Card>
      )}
    </section>
  );
}
