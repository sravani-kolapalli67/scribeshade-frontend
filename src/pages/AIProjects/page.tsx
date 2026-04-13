import { AIProjectsTable } from "@/components/AI projects/AIProjectsTable";

export default function AIProjects() {
  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <div>
        <AIProjectsTable />
      </div>
    </div>
  );
}
