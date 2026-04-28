import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface UseSessionEventsOptions {
  sessionId: string | undefined;
  enabled: boolean;
  onExhausted: () => void;
  onWarning?: (remainingMinutes: number) => void;
}

export function useSessionEvents({
  sessionId,
  enabled,
  onExhausted,
  onWarning,
}: UseSessionEventsOptions) {
  const onExhaustedRef = useRef(onExhausted);
  const onWarningRef = useRef(onWarning);

  useEffect(() => {
    onExhaustedRef.current = onExhausted;
  }, [onExhausted]);
  useEffect(() => {
    onWarningRef.current = onWarning;
  }, [onWarning]);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const eventSource = new EventSource(
      `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/events`,
      { withCredentials: true },
    );

    eventSource.addEventListener("CREDIT_WARNING", (event) => {
      try {
        const data = JSON.parse(event.data);
        onWarningRef.current?.(data.remainingMinutes ?? 1);
      } catch (err) {
        console.error("Failed to parse CREDIT_WARNING event:", err);
      }
    });

    eventSource.addEventListener("SESSION_CLOSED", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.reason === "CREDIT_EXHAUSTED") {
          onExhaustedRef.current();
        }
      } catch (err) {
        console.error("Failed to parse SESSION_CLOSED event:", err);
      }
    });

    eventSource.onerror = (err) => {
      console.error("SSE Connection failed:", err);
    };

    return () => {
      eventSource.close();
    };
  }, [enabled, sessionId]);
}
