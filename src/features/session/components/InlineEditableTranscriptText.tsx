import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface InlineEditableTranscriptTextProps {
  value: string;
  patchedByUser?: boolean;
  onPatch: (nextText: string) => void;
  className?: string;
  debounceMs?: number;
}

export function InlineEditableTranscriptText({
  value,
  patchedByUser = false,
  onPatch,
  className,
  debounceMs = 800,
}: InlineEditableTranscriptTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedRef = useRef(value);
  const lastExternalValueRef = useRef(value);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const externalChanged = value !== lastExternalValueRef.current;
    if (!isEditing || externalChanged) {
      if (node.textContent !== value) {
        node.textContent = value;
      }
      lastCommittedRef.current = value;
      lastExternalValueRef.current = value;
    }
  }, [value, isEditing]);

  const commit = useCallback(
    (nextValue: string) => {
      const normalized = (nextValue || "").trim().replace(/\s+/g, " ");
      if (!normalized || normalized === lastCommittedRef.current) return;
      lastCommittedRef.current = normalized;
      onPatch(normalized);
    },
    [onPatch],
  );

  const scheduleCommit = useCallback((nextValue: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commit(nextValue), debounceMs);
  }, [commit, debounceMs]);

  const flushCommit = useCallback((nextValue: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    commit(nextValue);
  }, [commit]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <div className="relative">
      <div
        ref={rootRef}
        role="textbox"
        aria-label="Editable transcript text"
        suppressContentEditableWarning
        contentEditable
        className={cn(
          "outline-none whitespace-pre-wrap break-words",
          "cursor-text",
          className,
        )}
        onFocus={() => setIsEditing(true)}
        onBlur={() => {
          const next = rootRef.current?.textContent || "";
          flushCommit(next);
          setIsEditing(false);
        }}
        onInput={() => {
          const next = rootRef.current?.textContent || "";
          scheduleCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const next = rootRef.current?.textContent || "";
            flushCommit(next);
            rootRef.current?.blur();
          }
        }}
      />
      {patchedByUser && (
        <span className="mt-1 inline-block text-[9px] uppercase tracking-wider text-amber-500/90">
          edited
        </span>
      )}
    </div>
  );
}
