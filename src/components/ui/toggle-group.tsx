"use client"

import * as React from "react"
import { cn } from "cn"

interface ToggleGroupContextValue {
  type?: "single" | "multiple"
  value: string | string[]
  onValueChange: (value: string) => void
  size?: "default" | "sm" | "lg"
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null)

interface ToggleGroupProps extends React.ComponentProps<"div"> {
  type?: "single" | "multiple"
  value: string | string[]
  onValueChange: (value: string) => void
  size?: "default" | "sm" | "lg"
}

function ToggleGroup({
  className,
  type = "single",
  value,
  onValueChange,
  size = "default",
  children,
  ...props
}: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ type, value, onValueChange, size }}>
      <div
        role="group"
        data-slot="toggle-group"
        className={cn("flex items-center gap-1.5", className)}
        {...props}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  )
}

interface ToggleGroupItemProps extends React.ComponentProps<"button"> {
  value: string
  size?: "default" | "sm" | "lg"
}

function ToggleGroupItem({
  className,
  value,
  size: itemSize,
  children,
  ...props
}: ToggleGroupItemProps) {
  const context = React.useContext(ToggleGroupContext)
  if (!context) {
    throw new Error("ToggleGroupItem must be used within ToggleGroup")
  }

  const isSelected =
    context.type === "multiple"
      ? Array.isArray(context.value) && context.value.includes(value)
      : context.value === value

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      data-state={isSelected ? "on" : "off"}
      data-slot="toggle-group-item"
      onClick={() => context.onValueChange(value)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border text-xs font-medium transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/30 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
        (itemSize ?? context.size) === "sm" ? "h-8 px-2.5" : "h-9 px-3.5",
        isSelected
          ? "border-[#315F86] bg-[#DCEBF4] font-semibold text-[#315F86] shadow-2xs"
          : "border-[#DED7CD] bg-white text-[#343338] hover:bg-[#F8F1E5]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export { ToggleGroup, ToggleGroupItem }
