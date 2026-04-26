import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex items-center justify-center bg-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden",
        "data-[orientation=horizontal]:w-2 data-[orientation=horizontal]:hover:w-3 data-[orientation=horizontal]:transition-[width]",
        "data-[orientation=vertical]:h-2 data-[orientation=vertical]:hover:h-3 data-[orientation=vertical]:transition-[height]",
        "hover:bg-slate-200/50",
        className
      )}
      {...props}
    >
      <div className={cn(
        "bg-border rounded-full",
        "data-[orientation=horizontal]:w-px data-[orientation=horizontal]:h-full",
        "data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full",
        "group-hover:bg-primary/50"
      )} />
      {withHandle && (
        <div className={cn(
          "z-10 flex shrink-0 rounded-full bg-slate-400/50 shadow-sm transition-all",
          "data-[orientation=horizontal]:h-8 data-[orientation=horizontal]:w-1.5",
          "data-[orientation=vertical]:w-8 data-[orientation=vertical]:h-1.5",
        )} />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
