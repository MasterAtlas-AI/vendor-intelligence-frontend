"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface Choice {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** A vertical list of checkboxes bound to a string array (roles, API key scopes). */
export function ChoiceList({
  idPrefix,
  choices,
  value,
  onChange,
}: {
  idPrefix: string;
  choices: Choice[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid gap-2.5">
      {choices.map((c) => (
        // Clicking the text toggles via the wrapping label; Base UI's checkbox is a span with role="checkbox",
        // so it needs an explicit aria-label to be announced by screen readers.
        <Label key={c.value} className="flex items-start gap-2.5 font-normal">
          <Checkbox
            name={`${idPrefix}-${c.value}`}
            aria-label={c.label}
            className="mt-0.5"
            checked={value.includes(c.value)}
            disabled={c.disabled}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, c.value] : value.filter((v) => v !== c.value))
            }
          />
          <span className="grid gap-0.5">
            <span className="font-medium">{c.label}</span>
            {c.description && <span className="text-xs text-muted-foreground">{c.description}</span>}
          </span>
        </Label>
      ))}
    </div>
  );
}
