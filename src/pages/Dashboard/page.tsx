import { OnboardingStepper } from "@/components/Dashboard/OnboardingStepper";
import { DownloadApp } from "@/components/Dashboard/DownloadApp";
import { SubscriptionPricing } from "@/components/Subscription/SubscriptionPricing";

export default function Dashboard() {
  return (
    <div className="flex flex-col space-y-6 w-full max-w-7xl mx-auto py-6">
      <OnboardingStepper />
      <div className="w-full py-12 my-12">
        <SubscriptionPricing />
      </div>
      <div className="px-4 w-full">
        <DownloadApp />
      </div>
    </div>
  );
}
