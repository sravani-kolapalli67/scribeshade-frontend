import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";

export interface CreditsBalance {
  purchasedCredits: string;
  earnedCredits: string;
  heldCredits: string;
  totalAvailable: string;
}

interface UseCreditsBalanceReturn {
  balance: CreditsBalance | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCreditsBalance(): UseCreditsBalanceReturn {
  const { getToken, isSignedIn } = useAuth();
  const [balance, setBalance] = useState<CreditsBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchBalance = async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/credits/balance`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (!res.ok) throw new Error("Failed to fetch balance");
        const json = await res.json();
        if (!cancelled) setBalance(json.data ?? json);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchBalance();
    return () => { cancelled = true; };
  }, [isSignedIn, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return { balance, isLoading, error, refresh };
}
