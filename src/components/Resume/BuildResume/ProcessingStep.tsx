"use client";

import { Sparkles } from "lucide-react";

export function ProcessingStep() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="relative">
        <div className="h-24 w-24 border-4 border-muted rounded-full" />
        <div className="absolute inset-0 h-24 w-24 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-0 m-auto h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-primary animate-pulse" />
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-2xl font-bold tracking-tight">
          Crafting Your Resume
        </h3>
        <p className="text-muted-foreground text-sm max-w-75 mx-auto leading-relaxed">
          <span className="animate-pulse">
            We're analyzing your details and applying the chosen template
            structure...
          </span>
        </p>
      </div>
      <div className="flex gap-1.5 pt-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
