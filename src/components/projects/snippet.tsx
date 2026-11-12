import { Fragment } from "react";

/** A matched passage from a document, the matched words (sent wrapped in [[ ]]) highlighted. */
export function Snippet({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      {text.split(/(\[\[.*?\]\])/g).map((part, i) =>
        part.startsWith("[[") && part.endsWith("]]") ? (
          <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-400/30">
            {part.slice(2, -2)}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
