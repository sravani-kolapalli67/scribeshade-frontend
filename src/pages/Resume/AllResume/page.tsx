import { useState } from "react";
import { useUser } from "@clerk/clerk-react";
import ListOfResumes, { Resume } from "@/components/Resume/ListOfResumes";

export default function AllResumes() {
  const { isLoaded, isSignedIn } = useUser();
  const userId = localStorage.getItem("userId") ?? "";
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);

  // Wait until Clerk has finished loading, the user is authenticated, and
  // useSyncUser has stored the DB UUID in localStorage.
  if (!isLoaded || !isSignedIn || !userId) return null;

  return (
    <div className="space-y-6">
      <ListOfResumes
        userId={userId}
        onSelectResume={setSelectedResume}
        selectedResumeId={selectedResume?.id}
      />
    </div>
  );
}
