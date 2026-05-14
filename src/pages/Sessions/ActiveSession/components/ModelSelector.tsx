import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const AI_MODELS = [
  { id: "anthropic/claude-haiku-4-5",          name: "Claude Haiku 4.5",      badge: "fast"      },
  { id: "anthropic/claude-sonnet-4-5",          name: "Claude Sonnet 4.5",     badge: "reasoning" },
  { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", badge: undefined   },
  { id: "openai/gpt-5",                          name: "GPT-5",                 badge: undefined   },
];

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  isFullscreen?: boolean;
  className?: string;
}

export function ModelSelector({
  value,
  onChange,
  isFullscreen,
  className,
}: ModelSelectorProps) {
  const selected = AI_MODELS.find((m) => m.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      {/* Custom trigger — renders name + badge inline so SelectValue never
          clips the badge. Width is sized to fit the longest option. */}
      <SelectTrigger
        className={cn(
          "h-9 rounded-xl border font-medium text-sm transition-all focus:ring-0 focus:ring-offset-0",
          isFullscreen
            ? "bg-white/10 border-white/20 text-white hover:bg-white/20"
            : "bg-white/50 border-slate-200 text-slate-700 hover:bg-white",
          className || "w-[215px]",
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{selected?.name ?? "Select model"}</span>
          {selected?.badge && (
            <span
              className={cn(
                "shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
                selected.badge === "fast"      && "bg-emerald-500/20 text-emerald-400",
                selected.badge === "reasoning" && "bg-violet-500/20 text-violet-400",
                selected.badge !== "fast" && selected.badge !== "reasoning" && "bg-white/10 text-white/50",
              )}
            >
              {selected.badge}
            </span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent
        // Open downward from trigger, center-aligned to prevent full-left stretch.
        // Using position="popper" ensures coordinate calculation respects the trigger's
        // actual viewport position rather than aligning to document origin.
        side="bottom"
        align="center"
        sideOffset={6}
        position="popper"
        className="rounded-xl border border-white/15 bg-zinc-900 text-white shadow-2xl shadow-black/40 min-w-[215px] z-[9999]"
        container={
          // #floating-portal-root is above the session card's compositor layer;
          // fall back to document.body if used outside the mini window.
          (typeof document !== "undefined"
            ? (document.getElementById("floating-portal-root") ?? document.body)
            : undefined) as HTMLElement | undefined
        }
      >
        {AI_MODELS.map((model) => (
          <SelectItem
            key={model.id}
            value={model.id}
            className={cn(
              "rounded-lg cursor-pointer text-white/80",
              // Hover / keyboard-highlighted state — shadcn's default
              // data-[highlighted]:bg-accent + text-accent-foreground would
              // render light bg with dark text on this dark popover. Override
              // both so highlighted items stay readable on the zinc-900 panel.
              "data-[highlighted]:bg-white/10 data-[highlighted]:text-white",
              "focus:bg-white/10 focus:text-white",
              "data-[state=checked]:text-white data-[state=checked]:bg-white/5",
            )}
          >
            <span className="flex items-center gap-2">
              {model.name}
              {model.badge && (
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
                  model.badge === "fast"      && "bg-emerald-500/20 text-emerald-400",
                  model.badge === "reasoning" && "bg-violet-500/20 text-violet-400",
                  model.badge !== "fast" && model.badge !== "reasoning" && "bg-white/10 text-white/50",
                )}>
                  {model.badge}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
