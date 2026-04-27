import { useState, useEffect, useRef, useCallback } from "react";

export const useScreenShare = (
  options: { autoStart?: boolean } = { autoStart: true },
) => {
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Keep a ref to the latest stream so the callback ref can access it
  // synchronously when the video element mounts/remounts.
  const streamRef = useRef<MediaStream | null>(null);
  // Internal ref to the actual DOM node (used by captureScreenshot)
  const videoNodeRef = useRef<HTMLVideoElement | null>(null);

  // Callback ref — React calls this whenever the <video> element
  // mounts OR unmounts (e.g. after a fullscreen toggle remounts it).
  // This guarantees srcObject is always re-attached to the live node.
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoNodeRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch((err) => console.error("Video play error:", err));
    }
  }, []);

  // Keep streamRef in sync and update the video element when stream changes
  useEffect(() => {
    streamRef.current = stream;
    if (videoNodeRef.current && stream) {
      videoNodeRef.current.srcObject = stream;
      videoNodeRef.current
        .play()
        .catch((err) => console.error("Video play error:", err));
    }
  }, [stream]);

  const startShare = useCallback(async () => {
    try {
      const displayMediaOptions: any = {
        video: {
          displaySurface: "monitor",
        },
        cursor: "never",
        audio: {
          systemAudio: "include",
        },
      };

      // Create a CaptureController if supported to prevent focus switching
      const controller =
        typeof (window as any).CaptureController !== "undefined"
          ? new (window as any).CaptureController()
          : null;

      if (controller) {
        displayMediaOptions.controller = controller;
      }

      const mediaStream =
        await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      // Prevent the browser from automatically focusing the shared tab/window
      if (controller && controller.setFocusBehavior) {
        try {
          controller.setFocusBehavior("no-focus-change");
        } catch (err) {
          console.warn("CaptureController.setFocusBehavior error:", err);
        }
      }

      setStream((prevStream) => {
        if (prevStream) {
          prevStream.getTracks().forEach((track) => track.stop());
        }
        return mediaStream;
      });
    } catch (err) {
      console.error("Screen share error:", err);
    }
  }, []);

  // Capture a screenshot from the video element
  const captureScreenshot = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!videoNodeRef.current) return resolve(null);
      const canvas = document.createElement("canvas");
      canvas.width = videoNodeRef.current.videoWidth;
      canvas.height = videoNodeRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(videoNodeRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    });
  }, []);

  // Auto-start screen share on mount
  useEffect(() => {
    if (options.autoStart) {
      startShare();
    }

    return () => {
      setStream((prevStream) => {
        if (prevStream) {
          prevStream.getTracks().forEach((track) => track.stop());
        }
        return null;
      });
    };
  }, [startShare, options.autoStart]);

  return {
    stream,
    videoRef,
    startShare,
    captureScreenshot,
  };
};
