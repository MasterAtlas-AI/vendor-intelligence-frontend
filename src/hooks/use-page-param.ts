"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** A query-string value kept in the URL (so a reload, a shared link or Back shows the same view). Setting the
 *  default (or "") removes it; other query values are kept. Replaces the history entry: no Back step per change. */
export function useQueryParam(key: string, fallback = ""): [string, (value: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (next: string) => {
      const query = new URLSearchParams(window.location.search);
      if (!next || next === fallback) query.delete(key);
      else query.set(key, next);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, fallback, pathname, router],
  );
  return [value, set];
}

/** The page number in `?page=` (1-based; anything else reads as 1). */
export function usePageParam(key = "page"): [number, (page: number) => void] {
  const [raw, setRaw] = useQueryParam(key);
  const n = Number(raw);
  const page = Number.isInteger(n) && n >= 1 ? n : 1;
  const setPage = useCallback((p: number) => setRaw(p > 1 ? String(Math.floor(p)) : ""), [setRaw]);
  return [page, setPage];
}
