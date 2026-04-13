"use client";

import { SubscriptionPricing } from "@/components/Subscription/SubscriptionPricing";

export default function BillingPage() {
  return (
    <div className="px-4 py-10 bg-transparent relative overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-brand/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
          Choose Your Plan
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto px-4 mb-10">
          Unlock the full power of AI-assisted interviews with our flexible
          subscription plans tailored to your career goals.
        </p>
      </div>

      <div className="max-w-6xl mx-auto relative z-10 space-y-20">
        <SubscriptionPricing />
      </div>
    </div>
  );
}
