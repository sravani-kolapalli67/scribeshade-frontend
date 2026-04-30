import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import UploadResumeDialog from "@/components/Resume/UploadResumeDialog";
import { ATSAnalysisDialog } from "./Resume/ATSAnalysisDialog";
import { BuildResumeDialog } from "./Resume/BuildResumeDialog";
import CreateSessionDialog from "@/components/Sessions/CreateSessionDialog";
import UploadDocumentDialog from "@/components/Document/UploadDocumentDialog";
import { GenerateProjectDialog } from "./AI projects/GenerateProjectDialog";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import { Coins, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const routeConfig: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/sessions": "Sessions",
  "/resume/all": "All Resumes",
  "/resume/ats-analysis": "ATS Analysis",
  "/resume/build": "Build Resume",
  "/resume/editor": "Resume Editor",
  "/resume/cover-letter": "Cover Letter",
  "/resume/ats-result": "ATS Result",
  "/analytics": "Analytics",
  "/document": "Document",
  "/questions": "Question Bank",
  "/ai-projects": "AI Projects",
  "/billing": "Subscription Plans",
};

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { balance } = useCreditsBalance();
  const title =
    Object.entries(routeConfig)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([route]) => location.pathname.startsWith(route))?.[1] ||
    "Craft Vita";

  const isResumePage = location.pathname.startsWith("/resume/all");
  const isATSAnalysisPage = location.pathname.startsWith(
    "/resume/ats-analysis",
  );
  const isBuildResumePage = location.pathname.startsWith("/resume/build");
  const isSessionsPage = location.pathname === "/sessions";

  // Conditions from the widget are passed as URL query params by the Rust
  // open_main_dashboard command (e.g. /sessions?openCreate=true&isFree=true).
  // Read them once on mount, then clear them from the URL so a refresh or
  // back-navigation doesn't accidentally re-open the dialog.
  const openCreate = searchParams.get("openCreate") === "true";
  const openCreateIsFree = searchParams.get("isFree") === "true";

  useEffect(() => {
    if (openCreate || openCreateIsFree) {
      // Remove the trigger params from the URL (replace: true keeps history clean).
      navigate(location.pathname, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run only once on mount

  const isDocumentPage = location.pathname.startsWith("/document");
  const isAIProjectsPage = location.pathname.startsWith("/ai-projects");
  const userId = localStorage.getItem("userId") || "";

  return (
    <nav className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 shadow-sm w-full h-18">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-gray-900 py-2">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {isSessionsPage && (
          <>
            <CreateSessionDialog
              isFree={true}
              defaultOpen={openCreate && openCreateIsFree}
            />
            <CreateSessionDialog
              isFree={false}
              defaultOpen={openCreate && !openCreateIsFree}
            />
          </>
        )}
        {isResumePage && <UploadResumeDialog userId={userId} />}
        {isATSAnalysisPage && <ATSAnalysisDialog />}
        {isBuildResumePage && <BuildResumeDialog />}
        {isDocumentPage && <UploadDocumentDialog userId={userId} />}
        {isAIProjectsPage && <GenerateProjectDialog />}

        {/* Credit balance badge */}
        {balance && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/billing"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand/8 hover:bg-brand/15 border border-brand/20 transition-colors group"
                >
                  <Coins className="h-3.5 w-3.5 text-brand" />
                  <span className="text-sm font-bold text-brand tabular-nums">
                    {balance.totalAvailable}
                  </span>
                  {parseFloat(balance.heldCredits) > 0 && (
                    <AlertCircle className="h-3 w-3 text-amber-500" />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-semibold">{balance.totalAvailable} credits available</p>
                {parseFloat(balance.heldCredits) > 0 && (
                  <p className="text-amber-500">{balance.heldCredits} held by active session</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
