"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { Conversation } from "@/lib/api/types";
import { errorMessage } from "@/lib/validation";

export const CHATS_KEY = ["assistant-conversations"];

const DAY = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "Previous 7 days", "Previous 30 days", then month and year. */
function group(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = today.getTime();
  if (d.getTime() >= t) return "Today";
  if (d.getTime() >= t - DAY) return "Yesterday";
  if (d.getTime() >= t - 7 * DAY) return "Previous 7 days";
  if (d.getTime() >= t - 30 * DAY) return "Previous 30 days";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The user's saved chats, newest first, grouped by when they were last used. Open, rename or delete a chat here. */
export function ChatList({
  chats,
  loading,
  activeId,
  disabled,
  onOpen,
  onNew,
  onDeleted,
}: {
  chats: Conversation[];
  loading: boolean;
  activeId: string | null;
  disabled: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<Conversation | null>(null);

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<Conversation>(`/assistant/conversations/${id}`, { method: "PATCH", body: { title } }),
    onSuccess: () => {
      setRenaming(null);
      void queryClient.invalidateQueries({ queryKey: CHATS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/assistant/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      setDeleting(null);
      onDeleted(id);
      void queryClient.invalidateQueries({ queryKey: CHATS_KEY });
      toast.success("Chat deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const groups: { label: string; items: Conversation[] }[] = [];
  for (const c of chats) {
    const label = group(c.updated_at);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(c);
    else groups.push({ label, items: [c] });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3">
      <Button variant="outline" className="justify-start" onClick={onNew} disabled={disabled}>
        <Plus /> New chat
      </Button>
      <nav aria-label="Saved chats" className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto">
        {loading && (
          <div className="grid gap-2">
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </div>
        )}
        {!loading && !chats.length && <p className="px-2 text-xs text-muted-foreground">Your chats are saved here.</p>}
        {groups.map((g) => (
          <div key={g.label} className="flex min-w-0 flex-col gap-0.5">
            <span className="px-2 text-xs font-medium text-muted-foreground">{g.label}</span>
            {g.items.map((c) => (
              <div
                key={c.id}
                className={`group flex min-w-0 items-center rounded-md text-sm hover:bg-muted ${c.id === activeId ? "bg-muted font-medium" : ""}`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left disabled:opacity-60"
                  disabled={disabled}
                  title={c.title}
                  aria-current={c.id === activeId ? "page" : undefined}
                  onClick={() => onOpen(c.id)}
                >
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{c.title}</span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${c.title}`}
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 data-[popup-open]:opacity-100"
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setTitle(c.title);
                        setRenaming(c);
                      }}
                    >
                      <Pencil /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(c)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ))}
      </nav>

      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming && title.trim()) rename.mutate({ id: renaming.id, title: title.trim() });
            }}
          >
            <Input aria-label="Chat name" autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || rename.isPending}>
                {rename.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="The chat and all its messages are deleted for good. Vendors and other records aren't affected."
        confirmLabel="Delete chat"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </aside>
  );
}
