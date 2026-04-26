import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

export function OnboardingStepper() {
  const { user } = useUser();
  const navigate = useNavigate();
  const firstName = user?.firstName || "User";

  return (
    <div className="w-full max-w-6xl mx-auto py-2 flex flex-col items-center">
      <h2 className="text-3xl font-bold text-center mb-10 flex items-center justify-center gap-2">
        Hi, {firstName} <span className="animate-wave text-4xl">👋</span>
      </h2>

      <div className="flex flex-col md:flex-row items-stretch justify-between w-full relative md:gap-8 gap-y-10">
        {/* Step 1 */}
        <div className="flex-1 flex flex-col w-full">
          <h3 className="text-lg font-medium mb-3 text-foreground flex-none h-7 pl-2">
            Optional: Resume 📝
          </h3>
          <div className="relative flex flex-col grow">
            <Card className="flex flex-col grow bg-card shadow-sm shadow-black/5 hover:shadow-md transition-shadow">
              <div className="p-5 grow text-[14px] leading-relaxed text-foreground w-full">
                Upload your resume so ScribeShade can generate custom answers to
                the interview questions.
              </div>
            </Card>
            {/* Arrow to next step */}
            <ArrowRight className="hidden md:block absolute top-1/2 -right-4 translate-x-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40 z-10" />
          </div>
          <div className="pt-4 flex-none">
            <Button
              variant="outline"
              className="w-full text-foreground border-border/60 hover:bg-muted/50 rounded-md"
              onClick={() => navigate("/resume/all")}
            >
              Upload Resume
            </Button>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex-1 flex flex-col w-full">
          <h3 className="text-lg font-medium mb-3 text-foreground flex-none h-7 pl-2">
            Step 1: Free Session ⏰
          </h3>
          <div className="relative flex flex-col grow">
            <Card className="flex flex-col grow bg-card shadow-sm shadow-black/5 hover:shadow-md transition-shadow">
              <div className="p-5 grow text-[14px] leading-relaxed text-foreground w-full">
                See how easy ScribeShade is to use. Free Sessions are free and
                limited to 5 minutes.
              </div>
            </Card>
            {/* Arrow to next step */}
            <ArrowRight className="hidden md:block absolute top-1/2 -right-4 translate-x-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40 z-10" />
          </div>
          <div className="pt-4 flex-none">
            <Button
              variant="outline"
              className="w-full text-foreground border-border/60 hover:bg-muted/50 rounded-md"
              onClick={() => navigate("/sessions")}
            >
              Create Session
            </Button>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex-1 flex flex-col w-full">
          <h3 className="text-lg font-medium mb-3 text-foreground flex-none h-7 pl-2">
            Step 2: Buy Credits 💳
          </h3>
          <div className="relative flex flex-col grow">
            <Card className="flex flex-col grow bg-card shadow-sm shadow-black/5 hover:shadow-md transition-shadow relative overflow-visible">
              <div className="p-5 grow text-[14px] leading-relaxed text-foreground w-full">
                Buy credits to use for the real interview or get unlimited
                access to all features by subscribing.
              </div>
            </Card>

            {/* Arrow to next step */}
            <ArrowRight className="hidden md:block absolute top-1/2 -right-4 translate-x-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40 z-10" />
          </div>

          <div className="pt-4 flex-none relative">
            {/* Glow Effect */}
            <div className="absolute inset-x-4 bottom-0 h-10 bg-linear-to-r from-emerald-300 via-cyan-400 to-blue-400 opacity-60 blur-xl translate-y-1 rounded-full pointer-events-none"></div>
            {/* Button */}
            <Button 
              className="w-full relative z-20 bg-[#0F172A] hover:bg-[#1E293B] text-white border-0 shadow-lg shadow-black/20 rounded-md transition-all active:scale-[0.98]"
              onClick={() => navigate("/billing")}
            >
              Purchase
            </Button>
          </div>
        </div>

        {/* Step 4 */}
        <div className="flex-1 flex flex-col w-full">
          <h3 className="text-lg font-medium mb-3 text-foreground flex-none h-7 pl-2">
            Step 3: Real Interview 🤖
          </h3>
          <div className="relative flex flex-col grow">
            <Card className="flex flex-col grow bg-card shadow-sm shadow-black/5 hover:shadow-md transition-shadow relative overflow-visible">
              <div className="p-5 grow text-[14px] leading-relaxed text-foreground w-full">
                Use ScribeShade for a real interview to get the job you have
                always dreamed of.
              </div>
            </Card>
          </div>
          <div className="pt-4 flex-none">
            <Button
              variant="outline"
              className="w-full text-foreground border-border/60 hover:bg-muted/50 rounded-lg"
            >
              Start Interview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
