import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const AI_MODELS = [
  { id: "google/gemma-4-26b-a4b-it", name: "Gemma 4 (26B)" },
  { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
];

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  isFullscreen?: boolean;
  className?: string;
}

export function ModelSelector({ value, onChange, isFullscreen, className }: ModelSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-9 rounded-xl border font-medium text-sm transition-all focus:ring-0 focus:ring-offset-0",
          isFullscreen
            ? "bg-white/10 border-white/20 text-white hover:bg-white/20"
            : "bg-white/50 border-slate-200 text-slate-700 hover:bg-white",
          className || "w-[180px]"
        )}
      >
        <SelectValue placeholder="Select AI Model" />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-slate-200 shadow-lg">
        {AI_MODELS.map((model) => (
          <SelectItem
            key={model.id}
            value={model.id}
            className="rounded-lg cursor-pointer focus:bg-slate-100 focus:text-slate-900"
          >
            {model.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
