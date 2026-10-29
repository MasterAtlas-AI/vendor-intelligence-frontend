import { authHeaders, buildUrl, refreshSession } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/store";

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Read a Server-Sent Events stream with fetch. EventSource can't send an Authorization header, so we parse
 * the stream ourselves. Resolves when the server closes the stream or `signal` aborts.
 */
export async function readEventStream(
  path: string,
  onEvent: (e: SseEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const open = () =>
    fetch(buildUrl(path), { headers: { ...authHeaders(), Accept: "text/event-stream" }, signal });

  const tokenUsed = useAuth.getState().accessToken;
  let res = await open();
  if (res.status === 401) {
    const current = useAuth.getState().accessToken;
    // Already refreshed by another request while this one was in flight: retry with the new token.
    if ((current && current !== tokenUsed) || (await refreshSession())) res = await open();
  }
  if (!res.ok || !res.body) throw new Error(`Event stream failed (${res.status})`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) continue; // heartbeat comment
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent({ event, data: data.join("\n") });
    }
  }
}
