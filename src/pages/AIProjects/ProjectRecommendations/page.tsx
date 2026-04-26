import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ProjectDetailsView } from "@/components/AI projects/ProjectDetailsView";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectResponse } from "@/components/AI projects/ProjectReportView";

interface ProjectRecord {
  id: string;
  position: string;
  jobDescription: string;
  resumeId: string | null;
  projects: ProjectResponse[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProjectRecommendations() {
  const { projectId } = useParams();
  const [data, setData] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      setLoading(true);
      setError(null);
      try {
        console.log("Fetching project with ID:", projectId);
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/projects/${projectId}`,
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to fetch project");
        }
        const json = await res.json();
        console.log("Fetched project data:", json);

        let projectsData = json.projects;
        if (typeof projectsData === "string") {
          try {
            projectsData = JSON.parse(projectsData);
          } catch (e) {
            console.error("Failed to parse projects JSON string", e);
            projectsData = [];
          }
        }

        // Handle case where JSON is { "projects": [ ... ] }
        if (
          projectsData &&
          typeof projectsData === "object" &&
          !Array.isArray(projectsData) &&
          Array.isArray(projectsData.projects)
        ) {
          projectsData = projectsData.projects;
        }

        // Handle case where array elements are stringified JSON
        if (Array.isArray(projectsData)) {
          projectsData = projectsData.map((p: any) => {
            if (typeof p === "string") {
              try {
                return JSON.parse(p);
              } catch (e) {
                console.error("Failed to parse project element JSON string", e);
                return p;
              }
            }
            return p;
          });
        }

        json.projects = Array.isArray(projectsData) ? projectsData : [];

        setData(json);
      } catch (err: any) {
        console.error("Fetch project error:", err);
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex-1 space-y-8 p-2">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-5 w-48 rounded-lg" />
        <div className="flex gap-2 mt-6">
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
        <div className="space-y-6 mt-8">
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <Skeleton className="h-60 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-4">
        <p className="text-lg font-bold text-destructive">
          {error || "Project not found"}
        </p>
        <Link to="/ai-projects">
          <Button variant="outline" className="gap-2 rounded-xl">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6">
      {/* Back link */}
      <Link to="/ai-projects">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 rounded-lg text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          All Projects
        </Button>
      </Link>

      {/* Report */}
      <ProjectDetailsView projects={data.projects} />
    </div>
  );
}
