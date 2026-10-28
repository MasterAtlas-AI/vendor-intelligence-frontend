import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/format";

const TONES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  succeeded: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  trial: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  invited: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  queued: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  running: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  partially_succeeded: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  suspended: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  disabled: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  revoked: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={TONES[status] ?? ""}>
      {humanize(status)}
    </Badge>
  );
}
