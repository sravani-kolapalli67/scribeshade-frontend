import { Button } from "@/components/ui/button";
import { Sparkles, Monitor } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatActionButtonsProps {
  onAiAnswer: () => void;
  onAnalyzeScreen: () => void;
  isAnswering: boolean;
  isAnalyzing: boolean;
  canAnswer: boolean;
  canAnalyze: boolean;
}

export const ChatActionButtons = ({
  onAiAnswer,
  onAnalyzeScreen,
  isAnswering,
  isAnalyzing,
  canAnswer,
  canAnalyze,
}: ChatActionButtonsProps) => {
  return (
    <div className="flex gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onAiAnswer}
            disabled={isAnswering || !canAnswer}
            className="flex-1 h-14 bg-[#1a1c23] hover:bg-[#252830] text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-[0_8px_16px_-4px_rgba(69,143,255,0.15)] relative overflow-hidden group disabled:opacity-50"
          >
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand group-hover:h-1 transition-all" />
            {isAnswering ? (
              <div className="h-5 w-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 text-brand fill-brand" />
            )}
            AI Answer
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-0 bg-transparent border-none shadow-none">
          <kbd className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs font-bold text-slate-900 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)]">
            <span className="text-base leading-none opacity-50">⌘</span>
            <span className="opacity-30 font-light">+</span>
            <span>G</span>
          </kbd>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onAnalyzeScreen}
            disabled={isAnalyzing || !canAnalyze}
            variant="outline"
            className="flex-1 h-14 border-slate-200 hover:bg-slate-50 rounded-2xl text-slate-700 font-bold flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isAnalyzing ? (
              <div className="h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Monitor className="h-5 w-5 text-slate-400" />
            )}
            Analyze Screen
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-0 bg-transparent border-none shadow-none">
          <kbd className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs font-bold text-slate-900 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)]">
            <span className="text-base leading-none opacity-50">⌘</span>
            <span className="opacity-30 font-light">+</span>
            <span>K</span>
          </kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
