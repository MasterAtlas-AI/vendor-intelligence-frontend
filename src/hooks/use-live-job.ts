import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { readEventStream } from "@/lib/api/sse";
import type { JobRead } from "@/lib/api/types";

export const TERMINAL_JOB_STATUSES = new Set(["succeeded", "partially_succeeded", "failed", "cancelled"]);

/** Subscribes to the job's SSE stream and writes each snapshot into the ["job", id] query cache.
 *  Returns whether the stream is currently connected. */
export function useLiveJob(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    readEventStream(
      `/jobs/${id}/events`,
      (e) => {
        setLive(true);
        try {
          queryClient.setQueryData(["job", id], JSON.parse(e.data) as JobRead);
        } catch {
          // ignore malformed frames
        }
      },
      controller.signal,
    )
      .catch(() => {
        if (!controller.signal.aborted) void queryClient.invalidateQueries({ queryKey: ["job", id] });
      })
      .finally(() => setLive(false));
    return () => controller.abort();
  }, [id, enabled, queryClient]);
  return live;
}
