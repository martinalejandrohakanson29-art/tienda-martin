"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const Popover = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("relative z-50 w-72", className)} {...props} />
))
Popover.displayName = "Popover"

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-100 hover:text-slate-900 h-10 px-4 py-2 bg-white text-slate-900 shadow-sm", className)}
    {...props}
  />
))
PopoverTrigger.displayName = "PopoverTrigger"

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "center" | "end" }
>(({ className, align = "center", children, ...props }, ref) => {
  const [position, setPosition] = React.useState<{ top: number; left: number; width: number } | null>(null)
  
  React.useEffect(() => {
    const updatePosition = () => {
      const trigger = document.activeElement as HTMLElement
      if (trigger) {
        const rect = trigger.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const alignOffset = align === "start" ? 0 : align === "end" ? 200 : 100
        setPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX + alignOffset,
          width: rect.width
        })
      }
    }
    
    updatePosition()
    window.addEventListener("scroll", updatePosition)
    window.addEventListener("resize", updatePosition)
    
    return () => {
      window.removeEventListener("scroll", updatePosition)
      window.removeEventListener("resize", updatePosition)
    }
  }, [align])
  
  return (
    <div
      ref={ref}
      className={cn(
        "z-50 w-72 rounded-md border border-slate-200 bg-white p-6 text-slate-950 shadow-md outline-none animate-in fade-in-0 zoom-in-95",
        className
      )}
      style={position ? { top: position.top, left: position.left, width: position.width } : undefined}
      {...props}
    >
      {children}
    </div>
  )
})
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }
