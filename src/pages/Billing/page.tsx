"use client";

import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import { useCreditBrackets } from "@/hooks/useCreditBrackets";
import { useCreditsLedger } from "@/hooks/useCreditsLedger";
import { useCreditsPurchases } from "@/hooks/useCreditsPurchases";
import { Coins, Clock, Zap, ShieldCheck, ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditPlansSection } from "@/components/Billing/CreditPlansSection";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    FULL_BRACKET: "Full session",
    HALF_BRACKET: "Grace zone",
    FREE_ZONE: "Free zone",
    PER_MINUTE_DEDUCTION: "Session usage",
    EXHAUSTED: "Credit limit reached",
    CAP_REACHED: "Session cap",
    PURCHASE: "Purchase",
    BONUS: "Bonus",
    REFUND: "Refund",
  };
  return map[reason] ?? reason;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { balance, isLoading: balanceLoading, refresh: refreshBalance } = useCreditsBalance();
  const { brackets, isLoading: bracketsLoading } = useCreditBrackets();
  const {
    entries,
    pagination,
    isLoading: ledgerLoading,
    page: ledgerPage,
    setPage: setLedgerPage,
  } = useCreditsLedger(10);
  const { purchases, isLoading: purchasesLoading } = useCreditsPurchases();

  return (
    <>
    <div className="px-4 py-10 bg-transparent relative overflow-hidden">
      {/* Background blob */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-brand/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-16">

        {/* ── Credit balance card ─────────────────────────────── */}
        <div className="rounded-2xl border border-brand/20 bg-brand-muted/40 backdrop-blur-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Your credit balance</p>
            {balanceLoading ? (
              <div className="h-10 w-28 rounded-lg bg-muted animate-pulse" />
            ) : balance ? (
              <>
                <p className="text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
                  {balance.totalAvailable}
                  <span className="text-base font-medium text-muted-foreground ml-2">credits</span>
                </p>
                {parseFloat(balance.heldCredits) > 0 && (
                  <p className="text-xs text-amber-600 font-medium">
                    {balance.heldCredits} held by an active session
                  </p>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </div>
          <div className="flex flex-col gap-2 text-xs text-muted-foreground min-w-48">
            {balance && (
              <>
                <div className="flex justify-between">
                  <span>Purchased</span>
                  <span className="font-semibold text-foreground tabular-nums">{balance.purchasedCredits}</span>
                </div>
                <div className="flex justify-between">
                  <span>Earned / Bonus</span>
                  <span className="font-semibold text-foreground tabular-nums">{balance.earnedCredits}</span>
                </div>
                <div className="flex justify-between border-t border-border/50 pt-2 mt-1">
                  <span>Held</span>
                  <span className="font-semibold text-amber-600 tabular-nums">{balance.heldCredits}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Session credit brackets ─────────────────────────── */}
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight mb-1">Session Pricing</h2>
            <p className="text-muted-foreground text-sm">Pay only for what you use — first {brackets[0]?.freeZoneMinutes ?? 5} minutes always free.</p>
          </div>

          {bracketsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {brackets.map((bracket) => (
                <div
                  key={bracket.id}
                  className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 hover:border-brand/40 hover:shadow-glow transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-brand" />
                      <span className="font-bold text-lg">{bracket.bracketMinutes} min</span>
                    </div>
                    <span className="text-2xl font-extrabold text-brand tabular-nums">
                      {bracket.creditsFull}
                      <span className="text-sm font-medium text-muted-foreground ml-1">credit</span>
                    </span>
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-emerald-500" />
                      <span>First <strong className="text-foreground">{bracket.freeZoneMinutes} min</strong> free</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                      <span>Grace zone: <strong className="text-foreground">{bracket.creditsHalf}</strong> credit for last {bracket.graceZoneMinutes} min</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-center">
            <Button
              size="lg"
              className="px-10 h-12 rounded-xl font-bold bg-[#0f172a] hover:bg-[#1e293b] text-white gap-2"
              onClick={() => {}}
            >
              <Coins className="h-4 w-4" />
              Buy Credits
            </Button>
          </div>
        </div>

        {/* ── Transaction ledger ──────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Transaction History</h2>
          <div className="rounded-2xl border border-border/60 overflow-hidden">
            {/* header row */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-3 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Type</span>
              <span>Reason</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Date</span>
            </div>

            {ledgerLoading ? (
              <div className="divide-y divide-border/40">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 px-5 flex items-center gap-4">
                    <div className="h-5 w-5 rounded-full bg-muted animate-pulse" />
                    <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                No transactions yet.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-0.5 items-center px-5 py-3.5 hover:bg-muted/20 transition-colors"
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full ${entry.type === "DEBIT" ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"}`}>
                      {entry.type === "DEBIT"
                        ? <ArrowUpRight className="h-3.5 w-3.5" />
                        : <ArrowDownLeft className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {reasonLabel(entry.reason)}
                      {entry.sessionId && (
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                          · session
                        </span>
                      )}
                    </span>
                    <span className={`sm:text-right text-sm font-bold tabular-nums ${entry.type === "DEBIT" ? "text-red-600" : "text-emerald-600"}`}>
                      {entry.type === "DEBIT" ? "−" : "+"}{entry.amount}
                    </span>
                    <span className="sm:text-right text-xs text-muted-foreground col-start-2 sm:col-auto">
                      {fmt(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  Page {pagination.page} of {pagination.pages} · {pagination.total} entries
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={ledgerPage <= 1}
                    onClick={() => setLedgerPage(ledgerPage - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={ledgerPage >= pagination.pages}
                    onClick={() => setLedgerPage(ledgerPage + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Purchase history ────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Purchase History</h2>
          <div className="rounded-2xl border border-border/60 overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Date</span>
              <span className="text-right">Amount Paid</span>
              <span className="text-right">Credits</span>
              <span className="text-right">Status</span>
            </div>

            {purchasesLoading ? (
              <div className="divide-y divide-border/40">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 px-5 flex items-center gap-4">
                    <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : purchases.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                No purchases yet.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {purchases.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-0.5 items-center px-5 py-3.5 hover:bg-muted/20 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">{fmt(p.createdAt)}</span>
                    <span className="sm:text-right text-sm font-semibold tabular-nums">
                      {p.amountPaid} {p.currency}
                    </span>
                    <span className="sm:text-right text-sm font-bold text-emerald-600 tabular-nums">
                      +{p.creditsAdded}
                    </span>
                    <div className="sm:text-right">
                      {p.status === "CONFIRMED" ? (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[11px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Confirmed
                        </Badge>
                      ) : p.status === "FAILED" ? (
                        <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 text-[11px] gap-1">
                          <XCircle className="h-3 w-3" /> Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[11px] gap-1">
                          <AlertCircle className="h-3 w-3" /> Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Credit plans for purchase ──────────────────────── */}
        <CreditPlansSection onSuccess={refreshBalance} />

      </div>
    </div>
    </>
  );
}
