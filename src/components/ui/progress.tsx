"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"



const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, style, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '9999px',
      backgroundColor: 'rgba(255,255,255,0.1)',
      ...style,
    }}
    {...props}
  >
    <ProgressPrimitive.Indicator
      style={{
        height: '100%',
        width: '100%',
        flex: '1 1 0%',
        backgroundColor: 'var(--accent-primary)',
        transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        transform: `translateX(-${100 - (value || 0)}%)`
      }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
