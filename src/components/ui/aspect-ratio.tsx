import * as React from "react"
import { cn } from "cn"

interface AspectRatioProps extends React.ComponentProps<"div"> {
  ratio?: number
}

function AspectRatio({ ratio = 1, className, style, ...props }: AspectRatioProps) {
  return (
    <div
      data-slot="aspect-ratio"
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: String(ratio), ...style }}
      {...props}
    />
  )
}

export { AspectRatio }
