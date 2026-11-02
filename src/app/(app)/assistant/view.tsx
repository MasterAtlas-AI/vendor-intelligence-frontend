"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ExternalLink, Globe, History, LayoutDashboard, MessageSquare, PanelLeft, Plus, Search, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CHATS_KEY, ChatList } from "@/components/assistant/chat-list";
import { type Exchange, Workspace } from "@/components/assistant/workspace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoAccess } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { ChatAction, ChatMessage, ChatResponse, CitedVendor, Conversation, ConversationDetail, DiscoveryAccepted, WebSource } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

interface Turn {
  role: "user" | "assistant";
  content: string;
  reply?: ChatResponse;
  at: string; // ISO time
}

const EXAMPLES = [
  "Who makes API 610 BB2 pumps for FPSO water injection?",
  "Which of our approved vendors supply ball valves?",
  "Compare the gas compression package vendors we know in India",
];

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Answer text with [V1] citations linked to the cited vendors, [W1] citations linked to the web pages found,
 *  and "- " lines as a list. */
function AnswerText({ text, vendors, web }: { text: string; vendors: CitedVendor[]; web: WebSource[] }) {
  const byRef = Object.fromEntries(vendors.map((v) => [v.ref, v]));
  const pages = Object.fromEntries(web.map((w) => [w.ref, w]));
  const inline = (line: string) =>
    line.split(/(\[[VW]\d{1,2}\])/g).map((part, i) => {
      const ref = /^\[([VW]\d{1,2})\]$/.exec(part)?.[1];
      if (!ref) return <Fragment key={i}>{part}</Fragment>;
      const page = pages[ref];
      if (page)
        return (
          <a
            key={i}
            href={page.url}
            target="_blank"
            rel="noreferrer noopener"
            title={page.title}
            className="mx-0.5 rounded bg-sky-500/15 px-1 text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            {ref}
          </a>
        );
      const v = byRef[ref];
      return v ? (
        <Link key={i} href={`/vendors/${v.vendor_id}`} title={v.name} className="mx-0.5 rounded bg-primary/10 px-1 text-xs font-medium text-primary hover:underline">
          {ref}
        </Link>
      ) : null;
    });
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-5 list-disc space-y-1">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    if (/^\s*[-*•]\s+/.test(line)) list.push(line.replace(/^\s*[-*•]\s+/, ""));
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="grid gap-2 text-sm leading-relaxed">{blocks}</div>;
}

/** Buttons for what the app can do next. Research asks for confirmation (it uses AI budget); discovery opens the
 *  prefilled Discover form, where the cost estimate is shown before anything starts. */
function Actions({ actions }: { actions: ChatAction[] }) {
  const router = useRouter();
  const canRun = useCan(P.DISCOVERY_RUN);
  const [pending, setPending] = useState<ChatAction | null>(null);
  const research = useMutation({
    mutationFn: (a: ChatAction) =>
      api<DiscoveryAccepted>(`/discovery/vendors/${a.vendor_id}/refresh`, {
        method: "POST",
        body: { max_pages: 12, ...(a.website ? { website: a.website } : {}) },
      }),
    onSuccess: (r) => {
      setPending(null);
      toast.success("Research started");
      router.push(`/discovery/${r.job_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canRun || !actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) =>
        a.kind === "research_vendor" ? (
          <Button key={i} size="sm" onClick={() => setPending(a)}>
            <Globe /> {a.label}
          </Button>
        ) : (
          <Button key={i} size="sm" onClick={() => router.push(`/discovery/new?brief=${encodeURIComponent(a.brief ?? "")}`)}>
            <Sparkles /> {a.label}
          </Button>
        ),
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Research ${pending?.vendor_name ?? "this vendor"}?`}
        description={
          pending &&
          `The AI reads up to 12 pages of ${pending.website ?? "the vendor's website"} and proposes what it finds (each fact quoting its page) for curator review${pending.website ? ", including this website for the vendor" : ""}. It usually costs a few cents of your AI budget and takes a few minutes.`
        }
        confirmLabel="Start research"
        pending={research.isPending}
        onConfirm={() => pending && research.mutate(pending)}
      />
    </div>
  );
}

/** The assistant's avatar beside its replies. */
function Avatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <Sparkles className="size-3.5" />
    </span>
  );
}

/** The steps the assistant took for this answer (folded to one line until opened). */
function Steps({ reply }: { reply: ChatResponse }) {
  const steps = reply.steps ?? [];
  if (!steps.length) return null;
  const total = steps.reduce((n, s) => n + s.ms, 0);
  return (
    <details className="group rounded-lg border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-emerald-600" />
        <span className="font-medium tracking-wide uppercase">Agent plan</span>
        <span>
          · {steps.length} steps · {(total / 1000).toFixed(1)} s
        </span>
        <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <ol className="grid gap-2 border-t px-3 py-2.5">
        {steps.map((st) => (
          <li key={st.key} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span className="min-w-0">
              <span className="font-medium">{st.label}</span>
              <span className="block text-xs text-muted-foreground">{st.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Reply({
  reply,
  onAsk,
  onShowWorkspace,
  inWorkspace,
}: {
  reply: ChatResponse;
  onAsk: (q: string) => void;
  onShowWorkspace?: () => void;
  inWorkspace?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <Steps reply={reply} />
      <AnswerText text={reply.answer} vendors={reply.vendors} web={reply.web_sources ?? []} />
      <Actions actions={reply.actions ?? []} />
      {reply.vendors.length > 0 && (
        <div className="grid gap-1.5 rounded-md border p-3 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Vendors cited</span>
          {reply.vendors.map((v) => (
            <div key={v.ref} className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary/10 px-1 text-xs font-medium text-primary">{v.ref}</span>
              <Link href={`/vendors/${v.vendor_id}`} className="font-medium hover:underline">
                {v.name}
              </Link>
              {v.country && <span className="text-xs text-muted-foreground">{countryName(v.country)}</span>}
              {v.avl_status && <StatusBadge status={v.avl_status} />}
              {[...new Map((v.sources ?? []).map((url) => [hostname(url), url])).entries()].slice(0, 2).map(([name, url]) => (
                <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:underline">
                  {name} <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
      {(reply.web_sources ?? []).length > 0 && (
        <div className="grid gap-1.5 rounded-md border p-3 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Globe className="size-3.5" /> From the web (not yet in the knowledge base, check before relying on it)
          </span>
          {(reply.web_sources ?? []).map((w) => (
            <div key={w.ref} className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded bg-sky-500/15 px-1 text-xs font-medium text-sky-700 dark:text-sky-300">{w.ref}</span>
              <a href={w.url} target="_blank" rel="noreferrer noopener" className="truncate font-medium hover:underline" title={w.url}>
                {w.title}
              </a>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                {hostname(w.url)} <ExternalLink className="size-3" />
              </span>
            </div>
          ))}
        </div>
      )}
      {reply.searched.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Search className="mt-0.5 size-3 shrink-0" />
          <span>Searched the knowledge base for: {reply.searched.join(" · ")}</span>
        </p>
      )}
      {onShowWorkspace && (reply.shortlist ?? []).length > 0 && (
        <Button size="sm" variant={inWorkspace ? "secondary" : "outline"} className="w-fit" onClick={onShowWorkspace}>
          <LayoutDashboard /> {inWorkspace ? "Shown in the workspace" : `Show shortlist of ${reply.shortlist?.length} in the workspace`}
        </Button>
      )}
      {reply.follow_ups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reply.follow_ups.map((q) => (
            <Button key={q} size="sm" variant="outline" className="h-auto max-w-full justify-start py-1 text-left whitespace-normal" onClick={() => onAsk(q)}>
              {q}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const canUse = useCan(P.SEARCH_RUN);
  const router = useRouter();
  const queryClient = useQueryClient();
  const urlChat = useSearchParams().get("c");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  // The saved chat on screen (null: a new one, saved when its first answer arrives). Kept in the URL as ?c=.
  const [chatId, setChatId] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(urlChat); // the chat being loaded
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // the saved-chats column while the workspace is open
  const [focus, setFocus] = useState<number | null>(null); // the exchange shown in the workspace (null: latest)
  const [mobileView, setMobileView] = useState<"chat" | "workspace">("chat");
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const chats = useQuery({ queryKey: CHATS_KEY, queryFn: () => api<Conversation[]>("/assistant/conversations?limit=200"), enabled: canUse });

  const show = useCallback(
    (id: string | null) => {
      setChatId(id);
      router.replace(id ? `/assistant?c=${id}` : "/assistant", { scroll: false });
    },
    [router],
  );

  // Loads a saved chat onto the screen. State changes happen in the promise callbacks, so the URL restore below
  // can start it from an effect.
  const load = useCallback(
    (id: string) =>
      queryClient
        .fetchQuery({
          queryKey: ["assistant-conversation", id],
          queryFn: () => api<ConversationDetail>(`/assistant/conversations/${id}`),
          staleTime: 0,
        })
        .then(
          (chat) => {
            setTurns(chat.messages.map((m) => ({ role: m.role, content: m.content, reply: m.reply ?? undefined, at: m.created_at })));
            setFocus(null);
            setDraft("");
            show(chat.id);
          },
          (e: unknown) => {
            toast.error(errorMessage(e));
            show(null);
          },
        )
        .finally(() => setOpening(null)),
    [queryClient, show],
  );
  function open(id: string) {
    setOpening(id);
    void load(id);
  }

  // Reopen the chat named in the URL (a reload, or a bookmark to one of your chats).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !canUse) return;
    restored.current = true;
    if (urlChat) void load(urlChat);
  }, [urlChat, canUse, load]);

  function newChat() {
    setTurns([]);
    setFocus(null);
    setMobileView("chat");
    setDraft("");
    show(null);
    input.current?.focus();
  }

  const ask = useMutation({
    mutationFn: (history: Turn[]) => {
      const lastReply = [...history].reverse().find((t) => t.reply)?.reply;
      const messages: ChatMessage[] = history.slice(-10).map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
      return api<ChatResponse>("/assistant/chat", {
        method: "POST",
        body: {
          messages,
          context_vendor_ids: (lastReply?.vendors ?? []).map((v) => v.vendor_id).slice(0, 10),
          conversation_id: chatId,
        },
      });
    },
    onSuccess: (reply) => {
      setTurns((t) => [...t, { role: "assistant", content: reply.answer, reply, at: new Date().toISOString() }]);
      setFocus(null); // the workspace follows the newest answer
      if (reply.conversation_id && reply.conversation_id !== chatId) show(reply.conversation_id);
      void queryClient.invalidateQueries({ queryKey: CHATS_KEY });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setTurns((t) => t.slice(0, -1)); // let the user edit and resend the question
    },
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, ask.isPending]);

  function send(text = draft) {
    const q = text.trim();
    if (!q || ask.isPending || opening) return;
    const next: Turn[] = [...turns, { role: "user", content: q, at: new Date().toISOString() }];
    setMobileView("chat");
    setTurns(next);
    setDraft("");
    ask.mutate(next);
  }

  // Question/answer pairs, for the workspace and its activity log. The workspace shows the picked answer, else the
  // newest one with a shortlist (else the newest).
  const exchanges = useMemo(
    () =>
      turns.flatMap((t, i): (Exchange & { turn: number })[] => {
        const q = turns[i - 1];
        return t.role === "assistant" && t.reply ? [{ question: q?.role === "user" ? q.content : "", reply: t.reply, askedAt: q?.at ?? t.at, turn: i }] : [];
      }),
    [turns],
  );
  const latest = [...exchanges].reverse().find((e) => (e.reply.shortlist ?? []).length) ?? exchanges.at(-1);
  const shown = (focus !== null ? exchanges.find((e) => e.turn === focus) : undefined) ?? latest;
  const workspace = Boolean(shown) && !opening;

  if (!canUse) return <NoAccess what="the assistant" />;

  const history = (
    <ChatList
      chats={chats.data ?? []}
      loading={chats.isPending}
      activeId={chatId}
      disabled={ask.isPending}
      onOpen={(id) => {
        setHistoryOpen(false);
        open(id);
      }}
      onNew={() => {
        setHistoryOpen(false);
        newChat();
      }}
      onDeleted={(id) => id === chatId && newChat()}
    />
  );
  const title = chatId ? (chats.data?.find((c) => c.id === chatId)?.title ?? "Assistant") : "New chat";

  // Full-height chat filling the content area (header is h-12, content padding p-4 / md:p-6): saved chats on the
  // left, messages scrolling in the middle, the question box pinned to the bottom.
  return (
    <div className="-m-4 flex h-[calc(100dvh-3rem)] min-h-0 md:-m-6">
      <div className={`hidden w-64 shrink-0 border-r p-3 ${!workspace || showHistory ? "lg:block" : ""}`}>{history}</div>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="p-3 pt-12">
          <SheetTitle className="sr-only">Saved chats</SheetTitle>
          {history}
        </SheetContent>
      </Sheet>

      <section
        className={`min-w-0 flex-col ${workspace ? `xl:flex xl:w-[26rem] 2xl:w-[30rem] xl:shrink-0 xl:border-r ${mobileView === "chat" ? "flex flex-1 xl:flex-none" : "hidden"}` : "flex flex-1"}`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Saved chats" onClick={() => setHistoryOpen(true)}>
            <History />
          </Button>
          {workspace && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              aria-label={showHistory ? "Hide saved chats" : "Show saved chats"}
              aria-pressed={showHistory}
              onClick={() => setShowHistory((v) => !v)}
            >
              <PanelLeft />
            </Button>
          )}
          <Sparkles className="size-4 shrink-0 text-primary" />
          <h1 className="truncate text-sm font-medium">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            {workspace && (
              <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setMobileView("workspace")}>
                <LayoutDashboard /> Workspace
              </Button>
            )}
            {turns.length > 0 && (
              <Button variant="outline" size="sm" onClick={newChat} disabled={ask.isPending}>
                <Plus /> New chat
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-3xl content-start gap-6 px-4 py-6">
            {opening && (
              <div className="grid gap-4" aria-label="Opening chat">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>
            )}
            {!opening && turns.length === 0 && !ask.isPending && (
              <div className="grid justify-items-center gap-6 pt-[8vh] text-center">
                <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-6" />
                </span>
                <div className="grid gap-1.5">
                  <h2 className="text-xl font-semibold tracking-tight">What vendors are you looking for?</h2>
                  <p className="max-w-lg text-sm text-muted-foreground">
                    Ask in plain words. Each answer searches the vendor knowledge base and the web together, citing every vendor and
                    page. Your chats are saved on the left.
                  </p>
                </div>
                <div className="grid w-full gap-2 sm:grid-cols-3">
                  {EXAMPLES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted"
                      onClick={() => send(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!opening &&
              turns.map((t, i) =>
                t.role === "user" ? (
                  <div
                    key={i}
                    className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground"
                  >
                    {t.content}
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <Avatar />
                    <div className="min-w-0 flex-1 pt-0.5">
                      {t.reply && (
                        <Reply
                          reply={t.reply}
                          onAsk={send}
                          inWorkspace={shown?.turn === i}
                          onShowWorkspace={() => {
                            setFocus(i);
                            setMobileView("workspace");
                          }}
                        />
                      )}
                    </div>
                  </div>
                ),
              )}
            {ask.isPending && (
              <div className="flex items-center gap-3" role="status">
                <Avatar />
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex gap-1" aria-hidden>
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </span>
                  Searching the knowledge base and the web…
                </span>
              </div>
            )}
            <div ref={bottom} />
          </div>
        </div>

        <div className="shrink-0 border-t bg-background px-4 pt-3 pb-2">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-muted/40 p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Textarea
              ref={input}
              aria-label="Your question"
              rows={1}
              maxLength={4000}
              placeholder="Ask about vendors, equipment, certifications…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className="max-h-40 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 rounded-xl"
              disabled={!draft.trim() || ask.isPending || Boolean(opening)}
              aria-label="Send"
            >
              <Send />
            </Button>
          </form>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-xs text-muted-foreground">
            Enter to send, Shift+Enter for a new line. Each question searches the knowledge base and the web (about 1-2 US cents of your AI budget).
          </p>
        </div>
      </section>

      {workspace && shown && (
        <section className={`min-w-0 flex-1 flex-col ${mobileView === "workspace" ? "flex" : "hidden xl:flex"}`} aria-label="Workspace">
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 xl:hidden">
            <Button variant="outline" size="sm" onClick={() => setMobileView("chat")}>
              <MessageSquare /> Back to chat
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <Workspace key={shown.turn} exchange={shown} exchanges={exchanges} />
          </div>
        </section>
      )}
    </div>
  );
}
