import { OnboardingStepper } from "@/components/Dashboard/OnboardingStepper";
import { DownloadApp } from "@/components/Dashboard/DownloadApp";
import { CreditPlansSection } from "@/components/Billing/CreditPlansSection";

export default function Dashboard() {
  return (
    <div className="flex flex-col space-y-6 w-full py-4 sm:py-6">
      <div className="w-full">
        <DownloadApp />
      </div>
      <OnboardingStepper />
      <div className="w-full py-8 sm:py-12 my-4 sm:my-12">
        <CreditPlansSection />
      </div>
    </div>
  );
}
