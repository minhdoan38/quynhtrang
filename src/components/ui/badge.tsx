import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-[#DDD6CC] bg-white text-[#2E3338]",
        pastel: "border-[#E7DEC8]/80 bg-[#FAF6EE] text-[#4A433A]",
        sage: "border-[#C8DAD0] bg-[#EAF2ED] text-[#2F5240]",
        rose: "border-[#EED6D0] bg-[#FBF0ED] text-[#853C32]",
        honey: "border-[#EFE1B8] bg-[#FDF7E7] text-[#7A5412]",
        slate: "border-[#D1DCE8] bg-[#EEF3F8] text-[#344E66]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
