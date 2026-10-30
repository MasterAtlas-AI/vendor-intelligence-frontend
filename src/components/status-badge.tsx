import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/format";

const GOOD = "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
const INFO = "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200";
const WARN = "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
const BAD = "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";

const TONES: Record<string, string> = {
  // proposals, items and import outcomes (Phase 2)
  approved: GOOD,
  auto_approved: GOOD,
  applied: GOOD,
  matched: GOOD,
  created: GOOD,
  pending_review: INFO,
  pending: INFO,
  proposed: INFO,
  already_proposed: INFO,
  needs_info: WARN,
  partially_approved: WARN,
  conditional: WARN,
  duplicate_in_file: WARN,
  ambiguous: WARN,
  unassessed: "",
  rejected: BAD,
  not_approved: BAD,
  blacklisted: BAD,
  invalid: BAD,
  discarded: "",
  // projects and scorecards (Phase 4)
  on_hold: WARN,
  closed: "",
  archived: "",
  longlist: "",
  shortlist: INFO,
  selected: GOOD,
  draft: "",
  issued: INFO,
  evaluating: WARN,
  awarded: GOOD,
  cancelled: BAD,
  quoted: GOOD,
  declined: BAD,
  lost: "",
  ready: GOOD,
  final: GOOD,
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
