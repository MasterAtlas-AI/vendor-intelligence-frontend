"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterSelect } from "@/components/filter-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { VerificationBadge } from "@/components/verification-badge";
import { api } from "@/lib/api/client";
import type { KnowledgeNote, NoteWrite } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { DEPARTMENTS, NOTE_KINDS, departmentLabel } from "@/lib/history";
import { errorMessage } from "@/lib/validation";

type Kind = NoteWrite["kind"];

export function noteKindLabel(kind: string): string {
  return NOTE_KINDS.find(([k]) => k === kind)?.[1] ?? kind;
}

function NoteForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>("lesson_learned");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [department, setDepartment] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<KnowledgeNote>("/knowledge-notes", {
        method: "POST",
        body: {
          kind,
          title: title.trim(),
          body: body.trim(),
          project_id: projectId,
          department: (department || null) as NoteWrite["department"],
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-notes"] });
      toast.success("Note added");
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Kind</Label>
          <FilterSelect
            label="Note kind"
            anyLabel={NOTE_KINDS[0][1]}
            value={kind === NOTE_KINDS[0][0] ? "" : kind}
            onChange={(v) => setKind((v || NOTE_KINDS[0][0]) as Kind)}
            options={NOTE_KINDS.slice(1).map(([value, label]) => ({ value, label }))}
            className="w-full"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Department</Label>
          <FilterSelect
            label="Department"
            anyLabel="Not set"
            value={department}
            onChange={setDepartment}
            options={DEPARTMENTS.map(([value, label]) => ({ value, label }))}
            className="w-full"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note-title">Title</Label>
        <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Seal supplier lead time doubled during FAT" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note-body">Details</Label>
        <Textarea id="note-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Saving…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

/** Lessons learned, operating feedback, maintenance and spares notes recorded against the project. */
export function ProjectNotes({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const canWrite = useCan(P.EQUIPMENT_READ);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("");
  const [deleting, setDeleting] = useState<KnowledgeNote | null>(null);
  const notes = useQuery({
    queryKey: ["knowledge-notes", { project_id: projectId, kind }],
    queryFn: () => api<KnowledgeNote[]>("/knowledge-notes", { query: { project_id: projectId, kind } }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/knowledge-notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-notes"] });
      setDeleting(null);
      toast.success("Note deleted");
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(errorMessage(e));
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Notes</CardTitle>
          <CardDescription>Lessons learned, operating feedback, maintenance and spares experience from this project.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Filter by kind"
            anyLabel="All kinds"
            value={kind}
            onChange={setKind}
            options={NOTE_KINDS.map(([value, label]) => ({ value, label }))}
            className="w-44"
          />
          {canWrite && !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add note
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {adding && <NoteForm projectId={projectId} onDone={() => setAdding(false)} />}
        {notes.isPending && <Skeleton className="h-16" />}
        {notes.isError && <p className="text-sm text-destructive">{errorMessage(notes.error)}</p>}
        {notes.isSuccess && notes.data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{kind ? "No notes of this kind." : "No notes yet."}</p>
        )}
        <ul className="divide-y">
          {notes.data?.map((n) => (
            <li key={n.id} className="grid gap-1 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{noteKindLabel(n.kind)}</Badge>
                    <span className="font-medium">{n.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDateTime(n.created_at)}</span>
                    {n.department && <span>· {departmentLabel(n.department)}</span>}
                    <VerificationBadge value={n.verification} />
                  </div>
                </div>
                {canWrite && (
                  <Button size="xs" variant="ghost" aria-label={`Delete note ${n.title}`} onClick={() => setDeleting(n)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              {n.body && <p className="text-sm whitespace-pre-wrap">{n.body}</p>}
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this note?"
        description="Only its author or a data administrator can delete a note. This can't be undone."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Card>
  );
}
