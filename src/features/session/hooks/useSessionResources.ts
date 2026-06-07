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

// ── Module-level TTL cache ────────────────────────────────────────────────────
// Prevents redundant /resume/list, /document/list, /projects/user fetches when
// the hook re-mounts (e.g., React StrictMode, window re-creation, state changes).
// Shared across all hook instances — one fetch serves every consumer.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedResources {
  resumes: Resume[];
  documents: Document[];
  aiProjects: AIProject[];
  fetchedAt: number;
  userId: string;
}

let _cachedResources: CachedResources | null = null;
let _inflight: Promise<CachedResources | null> | null = null;

function isCacheValid(userId: string): boolean {
  if (!_cachedResources) return false;
  if (_cachedResources.userId !== userId) return false;
  return Date.now() - _cachedResources.fetchedAt < CACHE_TTL_MS;
}

/**
 * Fetches resumes, documents, and AI projects for the current user in parallel.
 * Resolves the backend userId via /api/auth/me if not cached in localStorage.
 *
 * Uses a module-level TTL cache (5 min) so that multiple windows / hook mounts
 * share a single fetch result and don't fire duplicate API requests.
 */
export function useSessionResources(
  isSignedIn: boolean | undefined,
  clerkUserId: string | undefined,
): UseSessionResourcesReturn {
  const { getToken } = useAuth();

  const [resumes, setResumes] = useState<Resume[]>(
    () => _cachedResources?.resumes ?? [],
  );
  const [documents, setDocuments] = useState<Document[]>(
    () => _cachedResources?.documents ?? [],
  );
  const [aiProjects, setAIProjects] = useState<AIProject[]>(
    () => _cachedResources?.aiProjects ?? [],
  );
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !clerkUserId) return;

    let cancelled = false;

    const fetchData = async () => {
      // Immediately set loading to true for this mount
      setIsLoadingResumes(true);
      setIsLoadingDocs(true);
      setIsLoadingProjects(true);

      // Resolve backend userId
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

      if (!userId || cancelled) {
        if (!cancelled) {
          setIsLoadingResumes(false);
          setIsLoadingDocs(false);
          setIsLoadingProjects(false);
        }
        return;
      }

      // Serve from cache if valid
      if (isCacheValid(userId)) {
        if (!cancelled) {
          setResumes(_cachedResources!.resumes);
          setDocuments(_cachedResources!.documents);
          setAIProjects(_cachedResources!.aiProjects);
          setIsLoadingResumes(false);
          setIsLoadingDocs(false);
          setIsLoadingProjects(false);
        }
        return;
      }

      // Deduplicate concurrent fetches — if another mount is already fetching,
      // wait for that result instead of firing a second set of API calls.
      if (_inflight) {
        const result = await _inflight;
        if (!cancelled) {
          if (result) {
            setResumes(result.resumes);
            setDocuments(result.documents);
            setAIProjects(result.aiProjects);
          }
          setIsLoadingResumes(false);
          setIsLoadingDocs(false);
          setIsLoadingProjects(false);
        }
        return;
      }

      const doFetch = async (): Promise<CachedResources | null> => {
        try {
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

          const resumeData = resumeRes.ok
            ? await safeJson<unknown>(resumeRes)
            : null;
          const parsedResumes: Resume[] = Array.isArray(resumeData)
            ? resumeData
            : (resumeData as { data?: Resume[] })?.data || [];

          const docData = docRes.ok ? await safeJson<unknown>(docRes) : null;
          const parsedDocs: Document[] = Array.isArray(docData)
            ? docData
            : (docData as { data?: Document[] })?.data || [];

          const projectsData = projectsRes.ok
            ? await safeJson<unknown>(projectsRes)
            : null;
          const rawProjects = Array.isArray(projectsData)
            ? projectsData
            : (projectsData as { data?: AIProject[] })?.data || [];
          const parsedProjects = rawProjects as AIProject[];

          const cached: CachedResources = {
            resumes: parsedResumes,
            documents: parsedDocs,
            aiProjects: parsedProjects,
            fetchedAt: Date.now(),
            userId: userId!,
          };

          _cachedResources = cached;
          return cached;
        } catch (err) {
          console.error("[useSessionResources] fetch error:", err);
          return null;
        }
      };

      _inflight = doFetch();
      try {
        const result = await _inflight;
        if (!cancelled && result) {
          setResumes(result.resumes);
          setDocuments(result.documents);
          setAIProjects(result.aiProjects);
        }
      } finally {
        // Only null it out if this execution path created the inflight promise
        // (which it did, because we are the ones who assigned it above).
        _inflight = null;
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
