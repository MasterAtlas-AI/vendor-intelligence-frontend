"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Download, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EditEquipmentDialog } from "@/components/equipment/edit-equipment-dialog";
import { NotesPanel, ProcurementPanel } from "@/components/equipment/equipment-history-panels";
import { projectLabel, useAttributeDefs } from "@/components/equipment/shared";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { VerificationBadge } from "@/components/verification-badge";
import { EquipmentDocuments } from "@/components/projects/documents-tab";
import { api, download } from "@/lib/api/client";
import type { Equipment } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { formatDateTime, humanize } from "@/lib/format";
import { attributeIndex, departmentLabel, equipmentStatusLabel, formatAttribute } from "@/lib/history";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

const ORIGIN: Record<string, string> = {
  mel: "Master equipment list (MEL)",
  po: "Purchase order",
  datasheet: "Datasheet",
  tbe: "Technical bid evaluation",
  vendor_document: "Vendor document",
  manual: "Entered manually",
  extraction: "AI extraction",
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children || "—"}</dd>
    </div>
  );
}

export default function EquipmentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const canRead = useCan(P.EQUIPMENT_READ);
  const canManage = useCan(P.EQUIPMENT_MANAGE);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [fetchingSource, setFetchingSource] = useState(false);
  const equipment = useQuery({
    queryKey: ["equipment", id],
    queryFn: () => api<Equipment>(`/equipment/${id}`),
    enabled: canRead,
  });
  const defs = useAttributeDefs(canRead);
  const index = attributeIndex(defs.data);
  const archive = useMutation({
    mutationFn: () => api(`/equipment/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setArchiving(false);
      toast.success("Equipment archived. It stays on record for traceability.");
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const downloadSource = async (sourceRef: string) => {
    setFetchingSource(true);
    try {
      await download(`/equipment/${id}/source`, sourceRef.split(",")[0].trim() || "source");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setFetchingSource(false);
    }
  };

  if (!canRead) return <NoAccess what="the equipment history" />;
  const back = (
    <Link href="/equipment" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Equipment history
    </Link>
  );
  if (equipment.isPending)
    return (
      <>
        {back}
        <Skeleton className="h-64" />
      </>
    );
  if (equipment.isError)
    return (
      <>
        {back}
        <p className="text-sm text-destructive">{errorMessage(equipment.error)}</p>
      </>
    );

  const e = equipment.data;
  const p = e.project;
  const archived = e.verification === "archived";
  const attrs = Object.entries(e.attributes ?? {}).sort(([a], [b]) => (index[a]?.sort_order ?? 999) - (index[b]?.sort_order ?? 999) || a.localeCompare(b));

  return (
    <>
      {back}
      <PageHeader
        title={e.name || e.tag || "Equipment"}
        description={[e.tag, e.category_name, projectLabel(p)].filter(Boolean).join(" · ")}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              {!archived && (
                <Button variant="outline" onClick={() => setArchiving(true)}>
                  <Archive /> Archive
                </Button>
              )}
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <VerificationBadge value={e.verification} />
        <span className="text-xs text-muted-foreground">
          Source: {ORIGIN[e.origin] ?? humanize(e.origin)}
          {e.source_ref ? ` · ${e.source_ref}` : ""} · version {e.version} · added {formatDateTime(e.created_at)}
        </span>
        {e.has_source_file && (
          <Button variant="outline" size="sm" disabled={fetchingSource} onClick={() => void downloadSource(e.source_ref)}>
            <Download /> {fetchingSource ? "Downloading…" : "Download source file"}
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Tag">{e.tag}</Fact>
              <Fact label="Service">{e.service}</Fact>
              <Fact label="Category">{e.category_name ?? e.category_code}</Fact>
              <Fact label="Quantity">{e.quantity.toLocaleString()}</Fact>
              <Fact label="Vendor">
                {e.vendor_id ? (
                  <Link href={`/vendors/${e.vendor_id}`} className="hover:underline">
                    {e.vendor_name || "View vendor"}
                  </Link>
                ) : (
                  e.vendor_name
                )}
              </Fact>
              <Fact label="Manufacturer">
                {e.manufacturer_id ? (
                  <Link href={`/vendors/${e.manufacturer_id}`} className="hover:underline">
                    {e.manufacturer_name || "View manufacturer"}
                  </Link>
                ) : (
                  e.manufacturer_name
                )}
              </Fact>
              <Fact label="Model">{e.model}</Fact>
              <Fact label="Department">{e.department ? departmentLabel(e.department) : ""}</Fact>
              <Fact label="Equipment status">{e.status ? equipmentStatusLabel(e.status) : ""}</Fact>
              <div className="grid gap-0.5 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Standards</dt>
                <dd className="flex flex-wrap gap-1">
                  {e.standards.length === 0
                    ? "—"
                    : e.standards.map((s) => (
                        <Badge key={s} variant="outline">
                          {s}
                        </Badge>
                      ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Project</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Project">
                <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                {p.code && <span className="text-muted-foreground"> · {p.code}</span>}
              </Fact>
              <Fact label="Client">{p.client}</Fact>
              <Fact label="Year">{p.year ?? ""}</Fact>
              <Fact label="Country">{p.country ? countryName(p.country) : ""}</Fact>
              <Fact label="Facility">{p.facility_type}</Fact>
              <Fact label="Location">{p.location ? humanize(p.location) : ""}</Fact>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Technical data</CardTitle>
          </CardHeader>
          <CardContent>
            {attrs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No technical values recorded.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableBody>
                    {attrs.map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="text-muted-foreground">{index[key]?.label ?? key}</TableCell>
                        <TableCell className="tabular-nums">{formatAttribute(value, index[key]?.unit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Specification</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm whitespace-pre-line">{e.specs_text || <span className="text-muted-foreground">No specification text.</span>}</p>
            {e.notes && (
              <div className="grid gap-0.5">
                <span className="text-xs text-muted-foreground">Notes</span>
                <p className="text-sm whitespace-pre-line">{e.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <ProcurementPanel equipmentId={e.id} />
        </div>
        <div className="lg:col-span-2">
          <EquipmentDocuments projectId={e.project.id} equipmentId={e.id} />
        </div>
        <div className="lg:col-span-2">
          <NotesPanel equipment={e} />
        </div>
      </div>
      {canManage && <EditEquipmentDialog open={editing} onOpenChange={setEditing} equipment={e} />}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this equipment record?"
        description="It is marked archived / superseded and left out of searches by default. The record is kept for traceability."
        confirmLabel="Archive"
        destructive
        pending={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </>
  );
}
