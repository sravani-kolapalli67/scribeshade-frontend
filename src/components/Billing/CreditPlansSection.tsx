"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Coins, Zap, TrendingUp, CheckCircle2, Sparkles, ShieldCheck, TimerOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCreditPlans,
  type SupportedCurrency,
  type CreditPlan,
} from "@/hooks/useCreditPlans";

// ─── Razorpay types ───────────────────────────────────────────────────────────
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}
interface RazorpayOptions {
  key: string; amount: number; currency: string; name: string;
  description: string; order_id: string;
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

function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = { INR: "₹", USD: "$", GBP: "£" };
const CURRENCY_FLAGS:   Record<SupportedCurrency, string> = { INR: "🇮🇳", USD: "🇺🇸", GBP: "🇬🇧" };
const POPULAR_CODE    = "standard_60";
const BEST_VALUE_CODE = "mega_600";

function valueScore(plan: CreditPlan): number {
  const price = parseFloat(plan.amountMajor);
  return price > 0 ? parseFloat(plan.credits) / price : 0;
}

// ─────────────────────────────────────────────────────────────────────────────

interface CreditPlansSectionProps {
  onSuccess?: () => void;
}

export function CreditPlansSection({ onSuccess }: CreditPlansSectionProps) {
  const { getToken } = useAuth();
  const [currency, setCurrency]         = useState<SupportedCurrency>("INR");
  const [selectedPlan, setSelectedPlan] = useState<CreditPlan | null>(null);
  const [paying, setPaying]             = useState(false);

  const { plans, isLoading } = useCreditPlans(currency);
  const maxScore = plans.reduce((m, p) => Math.max(m, valueScore(p)), 0);
  const sym      = CURRENCY_SYMBOLS[currency];

  const handlePay = useCallback(async (plan: CreditPlan) => {
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
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ packCode: plan.code, currency: plan.currency }),
        },
      );

      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        const msg = err.error ?? "";
        if (msg === "Razorpay is not configured") {
          toast.error("Payment gateway is not available right now.", { description: "Please contact support or try again later." });
        } else if (msg === "Invalid packCode") {
          toast.error("Invalid pack selected. Please refresh and try again.");
        } else {
          toast.error(msg || "Could not create payment order. Please try again.");
        }
        return;
      }

      const { data: order } = await orderRes.json();

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: order.amountMinor,
          currency: order.currency,
          name: "ScribeShade",
          description: `${plan.name} — ${plan.credits} credits`,
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
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${verifyToken}` },
                  body: JSON.stringify({
                    razorpay_order_id:  response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature:  response.razorpay_signature,
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
              toast.success(`${result.creditsAdded} credits added to your account!`, {
                description: result.packName,
                duration: 5000,
              });
              setSelectedPlan(null);
              onSuccess?.();
              resolve();
            } catch (e) { reject(e); }
          },
        });
        rzp.open();
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "DISMISSED") {
        // silent — user closed Razorpay modal
      } else if (err instanceof Error && err.message !== "VERIFY_FAILED") {
        toast.error("Payment failed. Please try again.");
      }
    } finally {
      setPaying(false);
    }
  }, [getToken, onSuccess]);

  return (
    <section className="space-y-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Coins className="h-4 w-4" />
            </span>
            <h2 className="text-2xl font-extrabold tracking-tight">Buy Credits</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            One-time purchases — credits never expire and roll over forever.
          </p>
        </div>

        {/* Trust pills */}
        <div className="flex flex-wrap gap-2">
          {[
            { icon: <TimerOff className="h-3 w-3" />, label: "Never expire" },
            { icon: <ShieldCheck className="h-3 w-3" />, label: "Instant delivery" },
            { icon: <Sparkles className="h-3 w-3" />, label: "1 credit = 1h call" },
          ].map((t) => (
            <span
              key={t.label}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-border/50 text-[11px] font-medium text-muted-foreground"
            >
              <span className="text-brand">{t.icon}</span>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Currency switcher ── */}
      <div className="inline-flex rounded-2xl bg-muted/50 p-1.5 gap-1 border border-border/40 shadow-inner">
        {(["INR", "USD", "GBP"] as SupportedCurrency[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { setCurrency(c); setSelectedPlan(null); }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              currency === c
                ? "bg-white shadow-md text-foreground scale-105"
                : "text-muted-foreground hover:text-foreground hover:bg-white/40"
            }`}
          >
            <span className="text-sm">{CURRENCY_FLAGS[c]}</span>
            {c}
          </button>
        ))}
      </div>

      {/* ── Plan grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <Coins className="h-10 w-10 mb-4 opacity-30" />
          <p className="text-sm font-medium">No plans available right now.</p>
          <p className="text-xs mt-1">Please try a different currency or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isSelected  = selectedPlan?.code === plan.code;
            const isPopular   = plan.code === POPULAR_CODE;
            const isBestValue = plan.code === BEST_VALUE_CODE;
            const score        = valueScore(plan);
            const valuePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

            return (
              <div
                key={plan.code}
                onClick={() => setSelectedPlan(isSelected ? null : plan)}
                className={`relative rounded-2xl border p-5 cursor-pointer group transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-3 ${
                  isSelected
                    ? "border-brand bg-brand/[0.04] ring-2 ring-brand/20 shadow-xl shadow-brand/10"
                    : isPopular
                    ? "border-brand/40 bg-brand/[0.02] hover:border-brand/60 hover:shadow-lg hover:shadow-brand/5"
                    : "border-border/60 bg-card hover:border-brand/30 hover:shadow-md"
                }`}
              >
                {/* Badge */}
                {(isPopular || isBestValue) && (
                  <span className={`absolute -top-2.5 left-3 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm ${
                    isBestValue ? "bg-emerald-500 text-white" : "bg-brand text-white"
                  }`}>
                    {isBestValue ? "Best Value" : "Popular"}
                  </span>
                )}

                {/* Selected check */}
                {isSelected && (
                  <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-brand" />
                )}

                {/* Credits pill */}
                <div className="flex items-center gap-1.5">
                  <Zap className={`h-3.5 w-3.5 ${isSelected ? "text-brand" : "text-muted-foreground"}`} />
                  <span className={`text-[11px] font-bold tabular-nums ${isSelected ? "text-brand" : "text-muted-foreground"}`}>
                    {plan.credits} credits
                  </span>
                </div>

                {/* Name + price */}
                <div>
                  <p className="text-sm font-semibold text-foreground/80 leading-tight">{plan.name}</p>
                  <p className={`text-3xl font-black tabular-nums tracking-tight mt-1 ${isSelected ? "text-brand" : "text-foreground"}`}>
                    {sym}{plan.amountMajor}
                  </p>
                </div>

                {/* Feature blurb */}
                {plan.feature && (
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{plan.feature}</p>
                )}

                {/* Value bar */}
                <div className="mt-auto pt-1 flex items-center gap-1.5">
                  <TrendingUp className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isSelected ? "bg-brand" : "bg-muted-foreground/25 group-hover:bg-brand/40"}`}
                      style={{ width: `${valuePercent}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground/50 tabular-nums">{valuePercent}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Buy CTA ── */}
      {selectedPlan ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-brand/20 bg-brand/[0.03] px-6 py-4">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Selected pack</p>
            <p className="text-lg font-extrabold text-foreground">
              {selectedPlan.credits} credits — {sym}{selectedPlan.amountMajor}
            </p>
            <p className="text-xs text-muted-foreground">{selectedPlan.name}</p>
          </div>
          <Button
            onClick={() => handlePay(selectedPlan)}
            disabled={paying}
            className="gap-2.5 bg-brand hover:bg-brand/90 text-white font-bold h-12 px-8 rounded-2xl shadow-lg shadow-brand/20 active:scale-95 transition-all shrink-0 disabled:opacity-60"
          >
            {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Coins className="h-5 w-5" />}
            {paying ? "Processing…" : `Buy Now — ${sym}${selectedPlan.amountMajor}`}
          </Button>
        </div>
      ) : (
        !isLoading && plans.length > 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            ↑ Select a pack above to purchase
          </p>
        )
      )}
    </section>
  );
}


