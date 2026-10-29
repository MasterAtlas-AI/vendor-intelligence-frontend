"use client";

import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Globe, MessageSquare, RotateCcw, Search, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoAccess, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { ChatAction, ChatMessage, ChatResponse, CitedVendor, DiscoveryAccepted } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/validation";
import { countryName } from "@/lib/vendors";

interface Turn {
  role: "user" | "assistant";
  content: string;
  reply?: ChatResponse;
}

const EXAMPLES = [
  "Who makes API 610 BB2 pumps for FPSO water injection?",
  "Which of our approved vendors supply ball valves?",
  "Compare the gas compression package vendors we know in India",
];

/** Answer text with [V1] citations turned into links to the cited vendors, and "- " lines as a list. */
function AnswerText({ text, vendors }: { text: string; vendors: CitedVendor[] }) {
  const byRef = Object.fromEntries(vendors.map((v) => [v.ref, v]));
  const inline = (line: string) =>
    line.split(/(\[V\d{1,2}\])/g).map((part, i) => {
      const ref = /^\[(V\d{1,2})\]$/.exec(part)?.[1];
      const v = ref ? byRef[ref] : undefined;
      if (!ref) return <Fragment key={i}>{part}</Fragment>;
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

function Reply({ reply, onAsk }: { reply: ChatResponse; onAsk: (q: string) => void }) {
  return (
    <div className="grid gap-3">
      <AnswerText text={reply.answer} vendors={reply.vendors} />
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
              {(v.sources ?? []).slice(0, 2).map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:underline">
                  {new URL(url).hostname.replace(/^www\./, "")} <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
      {reply.searched.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Search className="size-3" /> Looked up: {reply.searched.join(" · ")}
        </p>
      )}
      {reply.follow_ups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reply.follow_ups.map((q) => (
            <Button key={q} size="sm" variant="outline" className="h-auto py-1 text-left whitespace-normal" onClick={() => onAsk(q)}>
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
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (history: Turn[]) => {
      const lastReply = [...history].reverse().find((t) => t.reply)?.reply;
      const messages: ChatMessage[] = history.slice(-10).map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
      return api<ChatResponse>("/assistant/chat", {
        method: "POST",
        body: { messages, context_vendor_ids: (lastReply?.vendors ?? []).map((v) => v.vendor_id).slice(0, 10) },
      });
    },
    onSuccess: (reply) => setTurns((t) => [...t, { role: "assistant", content: reply.answer, reply }]),
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
    if (!q || ask.isPending) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    ask.mutate(next);
  }

  if (!canUse) return <NoAccess what="the assistant" />;

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask about vendors in plain words. Answers come only from the vendor knowledge base and your organization's records, with every vendor cited."
        actions={
          turns.length > 0 && (
            <Button variant="outline" onClick={() => setTurns([])} disabled={ask.isPending}>
              <RotateCcw /> New conversation
            </Button>
          )
        }
      />
      <div className="mx-auto grid max-w-3xl gap-4">
        {turns.length === 0 && (
          <Card>
            <CardContent className="grid gap-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="size-4" /> Try asking:
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((q) => (
                  <Button key={q} variant="outline" size="sm" className="h-auto py-1.5 text-left whitespace-normal" onClick={() => send(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
              {t.content}
            </div>
          ) : (
            <Card key={i}>
              <CardContent>{t.reply && <Reply reply={t.reply} onAsk={send} />}</CardContent>
            </Card>
          ),
        )}
        {ask.isPending && (
          <Card>
            <CardContent className="text-sm text-muted-foreground">Looking through the knowledge base…</CardContent>
          </Card>
        )}
        <div ref={bottom} />
        <form
          className="sticky bottom-4 flex items-end gap-2 rounded-lg border bg-background p-2 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Textarea
            aria-label="Your question"
            rows={2}
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
            className="min-h-0 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" disabled={!draft.trim() || ask.isPending} aria-label="Send">
            <Send />
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">Each question uses a small amount of your organization&apos;s AI budget.</p>
      </div>
    </>
  );
}
