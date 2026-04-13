import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  isFullscreen?: boolean;
}

export const ChatInput = ({ value, onChange, isFullscreen = false }: ChatInputProps) => {
  return (
    <div className="flex gap-2 mb-4 transition-all">
      <div className="flex-1 relative">
        <input
          className={cn(
            "w-full h-12 rounded-xl px-4 text-sm font-bold transition-all focus:outline-none focus:ring-2",
            isFullscreen 
              ? "bg-black/40 border-white/20 text-white placeholder:text-slate-400 focus:ring-white/20 drop-shadow-lg" 
              : "bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-brand/20"
          )}
          placeholder="Type a manual message..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <Button 
        className={cn(
            "h-12 w-12 rounded-xl transition-all active:scale-95 shadow-none",
            isFullscreen
              ? "bg-white/20 border-white/20 text-white hover:bg-white/30"
              : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200"
        )}
      >
        <Send className="h-5 w-5" />
      </Button>
    </div>
  );
};
