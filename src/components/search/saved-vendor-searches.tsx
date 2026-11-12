"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { SavedSearch } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/validation";

/** Named vendor searches the user keeps (SOW 15): the query plus the filters, re-run with one click. */
export function SavedVendorSearches({
  query,
  filters,
  onRun,
}: {
  query: string;
  filters: Record<string, unknown>;
  onRun: (saved: SavedSearch) => void;
}) {
  const queryClient = useQueryClient();
  const actAs = useAuth((s) => s.actAs);
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  const key = ["saved-searches", "vendors", actAs?.id];
  const saved = useQuery({ queryKey: key, queryFn: () => api<SavedSearch[]>("/saved-searches", { query: { kind: "vendors" } }) });
  const save = useMutation({
    mutationFn: () => api<SavedSearch>("/saved-searches", { method: "POST", body: { kind: "vendors", name: name.trim(), query, filters } }),
    onSuccess: () => {
      setName("");
      setNaming(false);
      toast.success("Search saved");
      void queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/saved-searches/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bookmark className="size-4" /> Saved searches
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {saved.data?.length === 0 && <p className="text-muted-foreground">Save a search to re-run it later with its filters.</p>}
        {saved.data?.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" title={s.query} onClick={() => onRun(s)}>
              {s.name}
            </button>
            <Button variant="ghost" size="icon-xs" aria-label={`Delete ${s.name}`} onClick={() => remove.mutate(s.id)}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {naming ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) save.mutate();
            }}
          >
            <Input aria-label="Name for this search" autoFocus placeholder="e.g. API 610 pump vendors" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="h-8" />
            <Button type="submit" size="sm" disabled={!name.trim() || save.isPending}>
              Save
            </Button>
          </form>
        ) : (
          <Button variant="outline" size="sm" className="w-fit" disabled={!query.trim()} onClick={() => setNaming(true)}>
            Save this search
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
