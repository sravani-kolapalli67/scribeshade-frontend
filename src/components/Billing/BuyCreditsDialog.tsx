import { useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, Zap, Loader2, CheckCircle2, TrendingUp } from "lucide-react";
import {
  useCreditPlans,
  type SupportedCurrency,
  type CreditPlan,
} from "@/hooks/useCreditPlans";

// ── Razorpay types ────────────────────────────────────────────────────────────
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
// ─────────────────────────────────────────────────────────────────────────────

function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
};

const CURRENCY_FLAGS: Record<SupportedCurrency, string> = {
  INR: "🇮🇳",
  USD: "🇺🇸",
  GBP: "🇬🇧",
};

const POPULAR_CODE = "standard_60";
const BEST_VALUE_CODE = "mega_600";

// Computes credits per unit of major currency (higher = better value)
function valueScore(plan: CreditPlan): number {
  const price = parseFloat(plan.amountMajor);
  return price > 0 ? parseFloat(plan.credits) / price : 0;
}

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BuyCreditsDialog({
  open,
  onOpenChange,
  onSuccess,
}: BuyCreditsDialogProps) {
  const { getToken } = useAuth();
  const [currency, setCurrency] = useState<SupportedCurrency>("INR");
  const [selectedPlan, setSelectedPlan] = useState<CreditPlan | null>(null);
  const [paying, setPaying] = useState(false);

  const { plans, isLoading } = useCreditPlans(currency);

  // Derived: best value score to show relative bar
  const maxScore = plans.reduce((m, p) => Math.max(m, valueScore(p)), 0);

  const handlePay = useCallback(async () => {
    if (!selectedPlan) return;
    setPaying(true);

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Failed to load payment SDK. Check your connection.");
        return;
      }

      const token = await getToken();
      const orderRes = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/credits/purchase/order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            packCode: selectedPlan.code,
            currency: selectedPlan.currency,
          }),
        },
      );

      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        toast.error(err.error ?? "Could not create payment order.");
        return;
      }

      const { data: order } = await orderRes.json();

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amountMinor,
          currency: order.currency,
          name: "ScribeShade",
          description: `${selectedPlan.name} — ${selectedPlan.credits} credits`,
          order_id: order.orderId,
          theme: { color: "#458fff" },
          modal: { ondismiss: () => reject(new Error("DISMISSED")) },
          handler: async (response: RazorpayResponse) => {
            try {
              const verifyToken = await getToken();
              const verifyRes = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/credits/purchase/verify`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${verifyToken}`,
                  },
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                  }),
                },
              );

              if (!verifyRes.ok) {
                const err = await verifyRes.json().catch(() => ({}));
                toast.error(err.error ?? "Payment verification failed.");
                reject(new Error("VERIFY_FAILED"));
                return;
              }

              const { data: result } = await verifyRes.json();
              toast.success(
                `${result.creditsAdded} credits added to your account!`,
                { description: result.packName, duration: 5000 },
              );
              onSuccess?.();
              onOpenChange(false);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        });
        rzp.open();
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "DISMISSED") {
        // silent — user closed modal
      } else if (err instanceof Error && err.message !== "VERIFY_FAILED") {
        toast.error("Payment failed. Please try again.");
      }
    } finally {
      setPaying(false);
    }
  }, [selectedPlan, getToken, onSuccess, onOpenChange]);

  const sym = CURRENCY_SYMBOLS[currency];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] p-0 overflow-hidden gap-0">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40 bg-gradient-to-br from-brand/5 via-transparent to-transparent">
          <DialogHeader className="gap-1">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/15">
                <Coins className="h-4 w-4 text-brand" />
              </span>
              Buy Credits
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              One-time purchase · credits never expire · instant delivery
            </DialogDescription>
          </DialogHeader>

          {/* Currency tab switcher */}
          <div className="mt-4 inline-flex rounded-xl bg-muted/60 p-1 gap-0.5">
            {(["INR", "USD", "GBP"] as SupportedCurrency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCurrency(c); setSelectedPlan(null); }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  currency === c
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{CURRENCY_FLAGS[c]}</span>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* ── Plan grid ──────────────────────────────────────── */}
        <div className="px-6 py-4 overflow-y-auto max-h-[360px]">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {plans.map((plan) => {
                const isSelected = selectedPlan?.code === plan.code;
                const isPopular = plan.code === POPULAR_CODE;
                const isBestValue = plan.code === BEST_VALUE_CODE;
                const score = valueScore(plan);
                const valuePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

                return (
                  <button
                    key={plan.code}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative rounded-2xl border p-3.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      isSelected
                        ? "border-brand bg-brand/8 ring-1 ring-brand/30 shadow-md"
                        : "border-border/50 bg-card hover:border-brand/30 hover:bg-brand/4 hover:shadow-sm"
                    }`}
                  >
                    {/* Badge */}
                    {(isPopular || isBestValue) && (
                      <span className={`absolute -top-2.5 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isBestValue
                          ? "bg-emerald-500 text-white"
                          : "bg-brand text-white"
                      }`}>
                        {isBestValue ? "Best Value" : "Popular"}
                      </span>
                    )}

                    {/* Selected check */}
                    {isSelected && (
                      <CheckCircle2 className="absolute top-2.5 right-2.5 h-4 w-4 text-brand" />
                    )}

                    {/* Credits pill */}
                    <div className="flex items-center gap-1 mb-2">
                      <Zap className={`h-3 w-3 ${isSelected ? "text-brand" : "text-muted-foreground"}`} />
                      <span className={`text-[11px] font-bold tabular-nums ${isSelected ? "text-brand" : "text-muted-foreground"}`}>
                        {plan.credits} credits
                      </span>
                    </div>

                    <p className="text-sm font-bold text-foreground leading-tight">{plan.name}</p>
                    <p className={`text-xl font-extrabold tabular-nums mt-0.5 ${isSelected ? "text-brand" : "text-foreground"}`}>
                      {sym}{plan.amountMajor}
                    </p>

                    {/* Value bar */}
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <TrendingUp className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isSelected ? "bg-brand" : "bg-muted-foreground/30"}`}
                          style={{ width: `${valuePercent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-border/40 bg-muted/20">
          {selectedPlan ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">You're buying</p>
                <p className="text-sm font-bold text-foreground truncate">
                  {selectedPlan.credits} credits · {selectedPlan.name}
                </p>
              </div>
              <Button
                onClick={handlePay}
                disabled={paying}
                className="shrink-0 gap-2 bg-brand hover:bg-brand/90 text-white font-semibold h-10 px-5 rounded-xl"
              >
                {paying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Coins className="h-4 w-4" />
                )}
                {paying ? "Processing…" : `Pay ${sym}${selectedPlan.amountMajor}`}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                ← Select a pack to continue
              </p>
              <Button
                disabled
                className="shrink-0 gap-2 h-10 px-5 rounded-xl opacity-40"
              >
                <Coins className="h-4 w-4" />
                Pay & Add Credits
              </Button>
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}

