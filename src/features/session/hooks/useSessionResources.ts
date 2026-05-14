import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { safeJson } from "@/shared/utils/safeJson";
import { BACKEND_URL } from "@/features/launcher/constants";
import type { Resume, Document, AIProject } from "@/features/launcher/types";

interface UseSessionResourcesReturn {
  resumes: Resume[];
  documents: Document[];
  aiProjects: AIProject[];
  isLoadingResumes: boolean;
  isLoadingDocs: boolean;
  isLoadingProjects: boolean;
}

/**
 * Fetches resumes, documents, and AI projects for the current user in parallel.
 * Resolves the backend userId via /api/auth/me if not cached in localStorage.
 */
export function useSessionResources(
  isSignedIn: boolean | undefined,
  clerkUserId: string | undefined,
): UseSessionResourcesReturn {
  const { getToken } = useAuth();

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [aiProjects, setAIProjects] = useState<AIProject[]>([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !clerkUserId) return;

    let cancelled = false;

    const fetchData = async () => {
      setIsLoadingResumes(true);
      setIsLoadingDocs(true);
      setIsLoadingProjects(true);

      try {
        let userId = localStorage.getItem("userId");
        if (!userId) {
          const token = await getToken();
          if (token) {
            const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (meRes.ok) {
              const meData = await safeJson<{ id: string }>(meRes);
              if (meData?.id) {
                userId = meData.id;
                localStorage.setItem("userId", userId);
              }
            }
          }
        }

        if (!userId || cancelled) return;

        const token = await getToken();
        const authHeaders: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const [resumeRes, docRes, projectsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/resume/list?userId=${userId}`, {
            headers: authHeaders,
          }),
          fetch(`${BACKEND_URL}/api/document/list?userId=${userId}`, {
            headers: authHeaders,
          }),
          fetch(`${BACKEND_URL}/api/projects/user/${userId}`, {
            headers: authHeaders,
          }),
        ]);

        if (cancelled) return;

        const resumeData = resumeRes.ok
          ? await safeJson<unknown>(resumeRes)
          : null;
        setResumes(
          Array.isArray(resumeData)
            ? resumeData
            : (resumeData as { data?: Resume[] })?.data || [],
        );

        const docData = docRes.ok ? await safeJson<unknown>(docRes) : null;
        setDocuments(
          Array.isArray(docData)
            ? docData
            : (docData as { data?: Document[] })?.data || [],
        );

        const projectsData = projectsRes.ok
          ? await safeJson<unknown>(projectsRes)
          : null;
        const rawProjects = Array.isArray(projectsData)
          ? projectsData
          : (projectsData as { data?: AIProject[] })?.data || [];
        setAIProjects(rawProjects as AIProject[]);
      } catch (err) {
        console.error("[useSessionResources] fetch error:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingResumes(false);
          setIsLoadingDocs(false);
          setIsLoadingProjects(false);
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, clerkUserId, getToken]);

  return {
    resumes,
    documents,
    aiProjects,
    isLoadingResumes,
    isLoadingDocs,
    isLoadingProjects,
  };
}
