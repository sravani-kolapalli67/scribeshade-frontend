/**
 * CreditsBadge — live credit balance pill for the Navbar.
 *
 * Subscribes to the module-level external store in useCreditsBalance so it
 * reacts instantly to:
 *   • setOptimisticBalance(remaining)  — called right after any AI response
 *   • refreshCreditsBalance()          — called for full server re-sync
 *
 * The component never manages its own fetch; the hook handles that.
 * Extracted as a dedicated component so it mounts once and receives targeted
 * updates without re-rendering any parent (rerender-no-inline-components).
 */

import { Link } from "react-router-dom";
import { Coins, AlertCircle, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import { cn } from "@/lib/utils";

export function CreditsBadge() {
  const { balance, isLoading, refresh } = useCreditsBalance();

  // Don't render until the first balance loads — avoids flash of "0".
  if (!balance && !isLoading) return null;

  const total = balance?.totalAvailable ?? "…";
  const held  = parseFloat(balance?.heldCredits ?? "0");
  const low   = parseFloat(balance?.totalAvailable ?? "0") < 5;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/billing"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors group select-none",
              low
                ? "bg-red-50 border-red-200 hover:bg-red-100"
                : "bg-brand/8 border-brand/20 hover:bg-brand/15",
            )}
          >
            {isLoading ? (
              <RefreshCw className="h-3.5 w-3.5 text-brand animate-spin" />
            ) : (
              <Coins className={cn("h-3.5 w-3.5", low ? "text-red-500" : "text-brand")} />
            )}
            <span
              className={cn(
                "text-sm font-bold tabular-nums",
                low ? "text-red-600" : "text-brand",
              )}
            >
              {total}
            </span>
            {held > 0 && (
              <AlertCircle className="h-3 w-3 text-amber-500" />
            )}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs space-y-0.5">
          <p className="font-semibold">{total} credits available</p>
          {held > 0 && (
            <p className="text-amber-500">{balance?.heldCredits} held by active session</p>
          )}
          {low && (
            <p className="text-red-500">Running low — top up to continue</p>
          )}
          <button
            onClick={(e) => { e.preventDefault(); refresh(); }}
            className="text-muted-foreground hover:text-foreground underline underline-offset-2 text-[11px] block pt-0.5"
          >
            Refresh
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
