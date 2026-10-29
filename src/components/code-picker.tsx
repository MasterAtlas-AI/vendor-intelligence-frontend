"use client";

import { X } from "lucide-react";

import { FilterSelect } from "@/components/filter-select";
import { Badge } from "@/components/ui/badge";

/** Picks several codes from a list: a dropdown to add one, removable badges for those chosen. */
export function CodePicker({
  label,
  placeholder,
  options,
  value,
  onChange,
  max,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const names = Object.fromEntries(options.map((o) => [o.value, o.label.trim()]));
  const full = max !== undefined && value.length >= max;
  return (
    <div className="grid gap-2">
      <FilterSelect
        label={label}
        value=""
        anyLabel={full ? `Up to ${max} chosen` : placeholder}
        options={full ? [] : options.filter((o) => !value.includes(o.value))}
        onChange={(code) => code && onChange([...value, code])}
        className="w-full"
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <Badge key={code} variant="secondary" className="gap-1 pr-1">
              {names[code] ?? code}
              <button
                type="button"
                aria-label={`Remove ${names[code] ?? code}`}
                className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                onClick={() => onChange(value.filter((c) => c !== code))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
