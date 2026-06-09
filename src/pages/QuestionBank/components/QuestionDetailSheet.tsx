import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchQuestionDetail } from "../api";
import type { QuestionDetail } from "../types";
import { QuestionDetailContent } from "./QuestionDetailContent";

interface QuestionDetailSheetProps {
  questionId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function QuestionDetailSheet({
  questionId,
  onOpenChange,
}: QuestionDetailSheetProps) {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!questionId) {
      setDetail(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    fetchQuestionDetail(getToken, questionId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load question details",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [getToken, questionId]);

  return (
    <Sheet
      open={questionId !== null}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <SheetContent className="w-[92vw] overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Question details</SheetTitle>
          <SheetDescription>
            Privacy-safe aggregated interview intelligence
          </SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-6 w-2/3 rounded bg-muted" />
              <div className="h-24 rounded bg-muted" />
              <div className="h-40 rounded bg-muted" />
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          {detail ? <QuestionDetailContent detail={detail} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

