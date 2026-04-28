import { useState, useEffect } from "react";

export interface CreditBracket {
  id: string;
  bracketMinutes: number;
  creditsFull: string;
  creditsHalf: string;
  freeZoneMinutes: number;
  graceZoneMinutes: number;
  isActive: boolean;
}

interface UseCreditBracketsReturn {
  brackets: CreditBracket[];
  isLoading: boolean;
}

// Module-level cache — brackets don't change per request, no auth needed
let cachedBrackets: CreditBracket[] | null = null;
let isFetching = false;
const listeners: Array<(b: CreditBracket[]) => void> = [];

function subscribeBrackets(cb: (b: CreditBracket[]) => void) {
  if (cachedBrackets) { cb(cachedBrackets); return () => {}; }
  listeners.push(cb);
  if (!isFetching) {
    isFetching = true;
    fetch(`${import.meta.env.VITE_BACKEND_URL}/api/credits/brackets`)
      .then((r) => r.json())
      .then((json) => {
        cachedBrackets = (json.data ?? json).filter((b: CreditBracket) => b.isActive);
        listeners.splice(0).forEach((fn) => fn(cachedBrackets!));
      })
      .catch(() => {
        isFetching = false;
        listeners.splice(0);
      });
  }
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function useCreditBrackets(): UseCreditBracketsReturn {
  const [brackets, setBrackets] = useState<CreditBracket[]>(cachedBrackets ?? []);
  const [isLoading, setIsLoading] = useState(!cachedBrackets);

  useEffect(() => {
    if (cachedBrackets) {
      setBrackets(cachedBrackets);
      setIsLoading(false);
      return;
    }
    const unsub = subscribeBrackets((b) => {
      setBrackets(b);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  return { brackets, isLoading };
}
