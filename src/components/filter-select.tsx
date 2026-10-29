"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const ANY = "any";

/** A dropdown filter with an "any" option. `value` is "" when unset. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  anyLabel,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  anyLabel: string;
  className?: string;
}) {
  const items = { [ANY]: anyLabel, ...Object.fromEntries(options.map((o) => [o.value, o.label.trim()])) };
  return (
    <Select items={items} value={value || ANY} onValueChange={(v) => onChange(!v || v === ANY ? "" : String(v))}>
      <SelectTrigger aria-label={label} className={cn("w-48", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
