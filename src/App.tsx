import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useSyncUser } from "@/hooks/useSyncUser";
import "./App.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import Dashboard from "./pages/Dashboard/page";
import Sessions from "./pages/Sessions/page";
import AllResumes from "./pages/Resume/AllResume/page";
import ATSAnalysis from "./pages/Resume/ATSAnalysis/page";
import CoverLetter from "./pages/Resume/CoverLetter/page";
import ATSResult from "./pages/Resume/ATSResult/page";
import Analytics from "./pages/Analytics/page";
import DocumentPage from "./pages/Document/page";
import AllQuestions from "./pages/QuestionBank/All Questions/page";
import UserQuestions from "./pages/QuestionBank/User Questions/page";
import UserQuestionDetails from "./pages/QuestionBank/UserQuestionDetails/page";
import CompanyQuestions from "./pages/QuestionBank/CompanyQuestions/page";
import QuestionDetails from "./pages/QuestionBank/QuestionDetails/page";
import ActiveSession from "./pages/Sessions/ActiveSession/page";
import Navbar from "./components/Navbar";
import BuildResume from "./pages/Resume/BuildResume/page";
import ResumeEditor from "./pages/Resume/ResumeEditor/page";
import SignInPage from "./pages/Auth/SignIn/page";
import SignUpPage from "./pages/Auth/SignUp/page";
import BillingPage from "./pages/Billing/page";
import AIProjects from "./pages/AIProjects/page";
import ProjectRecommendations from "./pages/AIProjects/ProjectRecommendations/page";

function App() {
  const { isSignedIn, isLoaded } = useUser();
  const location = useLocation();
  useSyncUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
          <p className="text-slate-600 font-medium">Loading ScribeShade...</p>
        </div>
      </div>
    );
  }

  // Define paths that don't require authentication
  const authPaths = ["/sign-in", "/sign-up"];
  const isAuthPage = authPaths.some((path) =>
    location.pathname.startsWith(path),
  );

  if (!isSignedIn && !isAuthPage) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  // If already signed in and trying to access auth pages, redirect to dashboard
  if (isSignedIn && isAuthPage) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isSignedIn) {
    return (
      <Routes>
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  // Handle active session route (Overlay) outside main layout
  if (location.pathname.startsWith("/sessions/")) {
    const id = location.pathname.split("/")[2];
    if (id && id !== "list") {
      // Assuming list is /sessions or similar
      return (
        <Routes>
          <Route path="/sessions/:id" element={<ActiveSession />} />
        </Routes>
      );
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-muted/20">
        <Navbar />
        <div className="p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/resume/all" element={<AllResumes />} />
              <Route path="/resume/ats-analysis" element={<ATSAnalysis />} />
              <Route path="/resume/build" element={<BuildResume />} />
              <Route path="/resume/editor" element={<ResumeEditor />} />
              <Route path="/resume/cover-letter" element={<CoverLetter />} />
              <Route path="/resume/ats-result" element={<ATSResult />} />
              <Route path="/ai-projects" element={<AIProjects />} />
              <Route
                path="/ai-projects/:projectId"
                element={<ProjectRecommendations />}
              />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/document" element={<DocumentPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/questions/all" element={<AllQuestions />} />
              <Route path="/questions/user" element={<UserQuestions />} />
              <Route
                path="/questions/user/question/:questionId"
                element={<UserQuestionDetails />}
              />
              <Route
                path="/questions/company/:companyId"
                element={<CompanyQuestions />}
              />
              <Route
                path="/questions/company/:companyId/question/:questionId"
                element={<QuestionDetails />}
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
