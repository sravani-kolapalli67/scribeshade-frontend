"use client";

import * as React from "react";
import { Layout, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  category: string;
  thumbnail: string;
  code: string;
}

interface TemplateSelectionStepProps {
  selectedTemplateId: string | null;
  onSelect: (template: Template) => void;
}

export function TemplateSelectionStep({ selectedTemplateId, onSelect }: TemplateSelectionStepProps) {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/resume/all-templates`);
        if (!response.ok) throw new Error("Failed to fetch templates");
        const data = await response.json();
        setTemplates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading templates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-destructive">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="text-xs underline text-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 py-4 max-h-100 overflow-y-auto pr-2 no-scrollbar">
      {templates.map((tpl) => (
        <button
          key={tpl.id}
          onClick={() => onSelect(tpl)}
          className={cn(
            "flex flex-col p-4 rounded-xl border-2 transition-all text-left group",
            selectedTemplateId === tpl.id 
              ? "border-primary bg-primary/5 shadow-md scale-[1.02]" 
              : "border-border hover:border-border/60"
          )}
        >
          <div className={cn(
            "aspect-3/4 w-full rounded-lg mb-3 overflow-hidden transition-all shadow-inner relative",
            selectedTemplateId === tpl.id ? "ring-2 ring-primary ring-offset-2" : "bg-muted"
          )}>
            {tpl.thumbnail ? (
              <img 
                src={tpl.thumbnail} 
                alt={tpl.category} 
                className="w-full h-full object-cover transition-transform group-hover:scale-110"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Layout className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-2">
               <span className="text-[10px] font-bold text-white uppercase tracking-wider">{tpl.category}</span>
            </div>
          </div>
          <h4 className="font-bold text-sm tracking-tight">{tpl.category}</h4>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">Click to select this template</p>
        </button>
      ))}
    </div>
  );
}
