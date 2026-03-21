import { Routes, Route, Navigate } from "react-router-dom";
import { useUser, SignIn } from "@clerk/clerk-react";
import { useSyncUser } from "@/hooks/useSyncUser";
import "./App.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import Dashboard from "./pages/Dashboard/page";
import Sessions from "./pages/Sessions/page";
import AllResumes from "./pages/Resume/AllResume/page";
import ATSAnalysis from "./pages/Resume/ATSAnalysis/page";
import EditResume from "./pages/Resume/EditResume/page";
import CoverLetter from "./pages/Resume/CoverLetter/page";
import Analytics from "./pages/Analytics/page";
import QuestionBank from "./pages/QuestionBank/page";
import Account from "./pages/Account/page";

function App() {
  const { isSignedIn } = useUser();
  useSyncUser();

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <SignIn forceRedirectUrl="/dashboard" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-muted/20">
        <div className="p-8">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/resume/all" element={<AllResumes />} />
              <Route path="/resume/ats-analysis" element={<ATSAnalysis />} />
              <Route path="/resume/edit" element={<EditResume />} />
              <Route path="/resume/cover-letter" element={<CoverLetter />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/questions" element={<QuestionBank />} />
              <Route path="/account" element={<Account />} />
            </Routes>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
