import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { VendorSummary } from "@/lib/api/types";
import { countryName } from "@/lib/vendors";

export function VendorTable({
  rows,
  loading,
  empty,
  showOwnFields,
}: {
  rows: VendorSummary[];
  loading: boolean;
  empty: React.ReactNode;
  /** Show the organization's own AVL status and vendor code. */
  showOwnFields: boolean;
}) {
  const cols = showOwnFields ? 6 : 4;
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Headquarters</TableHead>
            <TableHead className="text-right">Equipment / services / certifications</TableHead>
            {showOwnFields && <TableHead>Your status</TableHead>}
            {showOwnFields && <TableHead>Your code</TableHead>}
            <TableHead>Website</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={cols}>
                <Skeleton className="h-6" />
              </TableCell>
            </TableRow>
          )}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={cols} className="py-8 text-center whitespace-normal text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {rows.map((v) => (
            <TableRow key={v.id}>
              <TableCell>
                <Link href={`/vendors/${v.id}`} className="font-medium hover:underline">
                  {v.display_name}
                </Link>
                {v.legal_name !== v.display_name && (
                  <div className="text-xs text-muted-foreground">{v.legal_name}</div>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {[v.hq_city, v.hq_country ? countryName(v.hq_country) : null].filter(Boolean).join(", ") || "—"}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                {v.equipment_count} / {v.service_count} / {v.certification_count}
              </TableCell>
              {showOwnFields && (
                <TableCell>{v.tenant ? <StatusBadge status={v.tenant.avl_status} /> : <span className="text-sm text-muted-foreground">Not on your list</span>}</TableCell>
              )}
              {showOwnFields && <TableCell className="font-mono text-xs">{v.tenant?.internal_vendor_code ?? ""}</TableCell>}
              <TableCell className="max-w-48 truncate text-sm">
                {v.website ? (
                  <a href={v.website} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                    {v.website.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
