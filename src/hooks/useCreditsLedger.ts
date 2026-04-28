import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";

export interface LedgerEntry {
  id: string;
  userId: string;
  sessionId: string | null;
  type: "DEBIT" | "CREDIT";
  amount: string;
  reason: string;
  createdAt: string;
}

export interface LedgerPagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface UseLedgerResult {
  entries: LedgerEntry[];
  pagination: LedgerPagination | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  setPage: (p: number) => void;
  refresh: () => void;
}

export function useCreditsLedger(limit = 20): UseLedgerResult {
  const { getToken } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [pagination, setPagination] = useState<LedgerPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const token = await getToken();
        if (cancelled) return;

        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/credits/ledger?page=${page}&limit=${limit}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (cancelled) return;

        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (cancelled) return;

        setEntries(json.data ?? []);
        setPagination(json.pagination ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [getToken, page, limit, tick]);

  return { entries, pagination, isLoading, error, page, setPage, refresh };
}
