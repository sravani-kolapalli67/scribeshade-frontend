import { useState } from "react";
import ListOfResumes, { Resume } from "@/components/Resume/ListOfResumes";

export default function AllResumes() {
  const userId = localStorage.getItem("userId");
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);

  return (
    <div className="space-y-6">
      <ListOfResumes
        userId={userId || ""}
        onSelectResume={setSelectedResume}
        selectedResumeId={selectedResume?.id}
      />
    </div>
  );
}
