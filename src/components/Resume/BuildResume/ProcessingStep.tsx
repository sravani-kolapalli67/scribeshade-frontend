"use client";

import { Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ProcessingStatus = "loading" | "success" | "error";

interface ProcessingStepProps {
  status?: ProcessingStatus;
  error?: string | null;
  onRetry?: () => void;
  onSkip?: () => void;
}

export function ProcessingStep({
  status = "loading",
  error = null,
  onRetry,
  onSkip,
}: ProcessingStepProps) {
  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-6 animate-in fade-in zoom-in duration-300">
        <div className="h-20 w-20 rounded-full bg-destructive/10 border-2 border-destructive/20 flex items-center justify-center">
          <AlertTriangle className="h-9 w-9 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold tracking-tight text-destructive">AI Extraction Failed</h3>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
            {error ?? "Something went wrong while processing your resume."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              className="rounded-xl gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </Button>
          )}
          {onSkip && (
            <Button
              onClick={onSkip}
              className="rounded-xl bg-black dark:bg-white text-white dark:text-black hover:opacity-90"
            >
              Continue Without AI
            </Button>
          )}
        </div>
      </div>
    );
  }

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
            AI is extracting and structuring your resume data into the chosen
            template…
          </span>
        </p>
      </div>
      <div className="flex gap-1.5 pt-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
