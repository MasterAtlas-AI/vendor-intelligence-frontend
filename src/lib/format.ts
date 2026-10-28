import { formatDistanceToNow } from "date-fns";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function humanize(value: string): string {
  return value.replace(/[_:.]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
