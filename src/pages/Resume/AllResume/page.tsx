import { useState } from "react";
import ListOfResumes, { Resume } from "@/components/Resume/ListOfResumes";

export default function AllResumes() {
  const userId = localStorage.getItem("userId");
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Resume</h1>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="rounded-xl px-6 py-5 font-medium"
          >
            Start Free Session
          </Button>
          <Button className="rounded-xl bg-black px-6 py-5 font-medium text-white hover:bg-black/90">
            Start Session
          </Button>
        </div>
      </div> */}

      <ListOfResumes
        userId={userId || ""}
        onSelectResume={setSelectedResume}
        selectedResumeId={selectedResume?.id}
      />
    </div>
  );
}
