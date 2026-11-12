import type { Verification } from "@/lib/api/types";
import { VERIFICATION } from "@/lib/history";

/** How far a record can be trusted (SOW 19): shown on every project-history record. */
export function VerificationBadge({ value }: { value: Verification | string }) {
  const v = VERIFICATION[value as Verification];
  if (!v) return null;
  return (
    <span title={v.hint} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${v.tone}`}>
      {v.label}
    </span>
  );
}
