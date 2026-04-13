import { useLocation } from "react-router-dom";
import UploadResumeDialog from "@/components/Resume/UploadResumeDialog";
import { ATSAnalysisDialog } from "./Resume/ATSAnalysisDialog";
import { BuildResumeDialog } from "./Resume/BuildResumeDialog";
import CreateSessionDialog from "@/components/Sessions/CreateSessionDialog";
import UploadDocumentDialog from "@/components/Document/UploadDocumentDialog";
import { GenerateProjectDialog } from "./AI projects/GenerateProjectDialog";

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
  const title =
    Object.entries(routeConfig)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([route]) => location.pathname.startsWith(route))?.[1] ||
    "ScribeShade";

  const isResumePage = location.pathname.startsWith("/resume/all");
  const isATSAnalysisPage = location.pathname.startsWith(
    "/resume/ats-analysis",
  );
  const isBuildResumePage = location.pathname.startsWith("/resume/build");
  const isSessionsPage = location.pathname === "/sessions";
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
            <CreateSessionDialog isFree={true} />
            <CreateSessionDialog isFree={false} />
          </>
        )}
        {isResumePage && <UploadResumeDialog userId={userId} />}
        {isATSAnalysisPage && <ATSAnalysisDialog />}
        {isBuildResumePage && <BuildResumeDialog />}
        {isDocumentPage && <UploadDocumentDialog />}
        {isAIProjectsPage && <GenerateProjectDialog />}
      </div>
    </nav>
  );
};

export default Navbar;
