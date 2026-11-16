"use client"

import { format, isValid, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** A day as the API sends it ("2027-01-15"), or "" for none. */
type DayString = string

function toDate(value: DayString | null | undefined): Date | undefined {
  if (!value) return undefined
  const d = parseISO(value)
  return isValid(d) ? d : undefined
}

/**
 * shadcn date picker (button + calendar popover). Works with the same "yyyy-MM-dd" strings as a native date input,
 * so forms keep their state as is: `value=""` is no date, and `onChange("")` clears it.
 */
function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  min,
  max,
  clearable = true,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: DayString | null | undefined
  onChange: (value: DayString) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  min?: DayString // earliest selectable day
  max?: DayString // latest selectable day
  clearable?: boolean
  "aria-label"?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = toDate(value)
  const from = toDate(min)
  const to = toDate(max)
  const disabledDays = [...(from ? [{ before: from }] : []), ...(to ? [{ after: to }] : [])]
  const today = new Date()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn("w-full justify-start gap-2 px-3 text-left font-normal", !selected && "text-muted-foreground", className)}
          />
        }
      >
        <CalendarIcon className="size-4 opacity-70" />
        <span className="flex-1 truncate">{selected ? format(selected, "dd MMM yyyy") : placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? from ?? today}
          captionLayout="dropdown"
          startMonth={new Date(today.getFullYear() - 15, 0)}
          endMonth={new Date(today.getFullYear() + 10, 11)}
          disabled={disabledDays.length ? disabledDays : undefined}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "")
            setOpen(false)
          }}
        />
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={(from && today < from) || (to && today > to)}
            onClick={() => {
              onChange(format(today, "yyyy-MM-dd"))
              setOpen(false)
            }}
          >
            Today
          </Button>
          {clearable && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!selected}
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A local day as "yyyy-MM-dd", today or `offset` days away (local time, not UTC). */
function localDay(offset = 0): DayString {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return format(d, "yyyy-MM-dd")
}

export { DatePicker, localDay }
