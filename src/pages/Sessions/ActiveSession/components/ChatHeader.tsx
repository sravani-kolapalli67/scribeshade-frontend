import { Button } from "@/components/ui/button";
import { Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  onExit: () => void;
  title?: string;
  isFullscreen?: boolean;
}

export const ChatHeader = ({
  onExit,
  title = "ScribeShade",
  isFullscreen = false,
}: ChatHeaderProps) => {
  return (
    <header
      className={cn(
        "h-16 border-b flex items-center justify-between px-6 shrink-0 transition-colors duration-300",
        isFullscreen
          ? "bg-transparent border-white/10 drop-shadow-lg"
          : "bg-transparent border-slate-200/50",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* <div className="h-8 w-8 bg-brand/10 rounded-lg flex items-center justify-center">
            <BotIcon className="h-5 w-5 text-brand" />
          </div> */}
          <span
            className={cn(
              "text-xl font-bold tracking-tight",
              isFullscreen
                ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                : "text-slate-800",
            )}
          >
            {title}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Timer Badge (HUD Style) */}
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-1.5 border border-white/20 rounded-xl text-sm font-bold shadow-sm",
            isFullscreen
              ? "bg-black/40 text-white backdrop-blur-sm"
              : "bg-white/20 text-slate-600",
          )}
        >
          <Clock className="h-4 w-4 text-rose-500" />
          <span>
            5 mins <span className="text-slate-400 text-xs">(Free)</span>
          </span>
        </div>

        {/* Action Row */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-10 w-10 p-0 rounded-xl border-slate-200 bg-white/50 backdrop-blur-sm hover:bg-white shadow-sm"
            title="External Link"
          >
            <ExternalLink className="h-5 w-5 text-slate-400" />
          </Button>
          <Button
            onClick={onExit}
            className="bg-red-500 hover:bg-red-600 text-white px-6 rounded-xl font-bold h-10 shadow-[0_4px_12px_rgba(239,68,68,0.2)] border-none"
          >
            Exit
          </Button>
        </div>
      </div>
    </header>
  );
};

// function BotIcon(props: any) {
//   return (
//     <svg
//       {...props}
//       xmlns="http://www.w3.org/2000/svg"
//       width="24"
//       height="24"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <path d="M12 8V4H8" />
//       <rect width="16" height="12" x="4" y="8" rx="2" />
//       <path d="M2 14h2" />
//       <path d="M20 14h2" />
//       <path d="M15 13v2" />
//       <path d="M9 13v2" />
//     </svg>
//   );
// }
