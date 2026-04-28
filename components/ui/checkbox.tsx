import * as React from "react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        className={cn(
          "h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer",
          className
        )}
        onChange={(e) => {
          if (onCheckedChange) onCheckedChange(e.target.checked)
          if (props.onChange) props.onChange(e)
        }}
        ref={ref}
        {...props}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
