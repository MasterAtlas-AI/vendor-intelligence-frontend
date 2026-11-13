"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { DOC_TYPES } from "@/components/projects/documents-tab";
import { Snippet } from "@/components/projects/snippet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounced } from "@/hooks/use-debounced";
import { usePageParam, useQueryParam } from "@/hooks/use-page-param";
import { api, download } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";

type DocumentSearch = components["schemas"]["DocumentSearch"];

const PAGE_SIZE = 20;
const typeLabel = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? t;

/** SOW H.4 / 25.4: every project's documents searched by their words (reports, letters, datasheets), number, title
 *  or file name. The text is read on the server when a document is added; nothing goes to an AI. */
export default function DocumentsPage() {
  const canRead = useCan(P.EQUIPMENT_READ);
  const router = useRouter();
  const pathname = usePathname();
  const [qParam] = useQueryParam("q");
  const [type] = useQueryParam("type");
  const [page, setPage] = usePageParam();
  const [search, setSearch] = useState(qParam);
  const q = useDebounced(search.trim(), 400);
  // The URL changed without typing (the sidebar link, Back): the box shows the URL's words. Adjusted while
  // rendering, as React recommends; q is what the box last pushed, so the user's own typing is never undone.
  const [seenQ, setSeenQ] = useState(qParam);
  if (qParam !== seenQ) {
    setSeenQ(qParam);
    if (qParam !== q) setSearch(qParam);
  }
  useEffect(() => {
    if (q !== qParam) {
      // One URL update: the new words, back to the first page.
      const query = new URLSearchParams(window.location.search);
      if (q) query.set("q", q);
      else query.delete("q");
      query.delete("page");
      router.replace(query.toString() ? `${pathname}?${query}` : pathname, { scroll: false });
    }
    // Only the typed words drive this; the URL changing on its own (Back) is read through qParam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const results = useQuery({
    queryKey: ["document-search", qParam, type, page],
    queryFn: () =>
      api<DocumentSearch>("/project-documents/search", {
        query: { q: qParam, doc_type: type || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
      }),
    enabled: canRead && qParam.length >= 2,
    placeholderData: (previous) => previous,
  });
  if (!canRead) return <NoAccess what="project documents" />;
  const data = qParam.length >= 2 ? results.data : undefined;
  return (
    <>
      <PageHeader
        title="Document search"
        description="Search every project's documents by the words inside them: reports, correspondence, datasheets and specifications, as well as numbers and titles."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-xl">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search documents"
            placeholder='e.g. seal failure, "plan 53B", 20171-SPOG-62400'
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <FilterSelect
          label="Type"
          anyLabel="All types"
          value={type}
          onChange={(v) => {
            // One URL update for both (two replaces would race and the second would drop the type).
            const query = new URLSearchParams(window.location.search);
            if (v) query.set("type", v);
            else query.delete("type");
            query.delete("page");
            router.replace(query.toString() ? `${pathname}?${query}` : pathname, { scroll: false });
          }}
          options={DOC_TYPES.map((d) => ({ ...d }))}
          className="w-48"
        />
      </div>
      {qParam.length < 2 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Type at least two characters. All the words must appear (in any form: &ldquo;failed&rdquo; finds &ldquo;failure&rdquo;); put a phrase in quotes.
        </p>
      )}
      {qParam.length >= 2 && results.isPending && <Skeleton className="h-40" />}
      {results.isError && <p className="text-sm text-destructive">{errorMessage(results.error)}</p>}
      {data && data.items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No document mentions &ldquo;{qParam}&rdquo;.</p>
      )}
      {data && data.items.length > 0 && (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {data.total.toLocaleString()} document{data.total === 1 ? "" : "s"}
          </p>
          {data.items.map((d) => (
            <Card key={d.id} size="sm">
              <CardContent className="grid gap-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground">
                      <Link href={`/projects/${d.project_id}`} className="hover:underline">
                        {d.project_code ? `${d.project_code} · ${d.project_name}` : d.project_name}
                      </Link>
                      {[d.doc_number, d.revision && `Rev. ${d.revision}`, d.doc_date, d.vendor_name].filter(Boolean).map((x) => ` · ${x}`)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="secondary">{typeLabel(d.doc_type)}</Badge>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Download ${d.filename}`}
                      onClick={() => void download(`/project-documents/${d.id}/file`, d.filename).catch((e: unknown) => toast.error(errorMessage(e)))}
                    >
                      <Download />
                    </Button>
                  </div>
                </div>
                {d.equipment_id && (
                  <Link href={`/equipment/${d.equipment_id}`} className="w-fit text-xs hover:underline">
                    {d.equipment_label}
                  </Link>
                )}
                <Snippet text={d.snippet} />
              </CardContent>
            </Card>
          ))}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            loading={results.isFetching}
            onPage={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      )}
    </>
  );
}
