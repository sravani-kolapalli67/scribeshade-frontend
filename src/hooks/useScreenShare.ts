import { useState, useEffect, useRef, useCallback } from "react";

// Metadata about a display — mirrors the Rust ScreenInfo struct
export interface ScreenInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  thumbnail: string;
  is_primary: boolean;
  /** true for the synthetic "Entire Screen" entry that captures all displays. */
  capture_all: boolean;
  /** CGWindowID when this entry represents an application window; null for displays. */
  window_id: number | null;
  /** Application name for window entries; null for display entries. */
  app_name: string | null;
}

/**
 * Returns true when the page is running inside the Tauri desktop app on macOS.
 * On macOS, WKWebView does not support the Chrome-style getDisplayMedia picker,
 * so we use the Rust `screenshots` crate instead.
 */
const isMacOSTauri = (): boolean =>
  typeof window !== "undefined" &&
  !!(window as any).__TAURI_INTERNALS__ &&
  /Mac/.test(navigator.platform + " " + navigator.userAgent);

export const useScreenShare = (
  options: { autoStart?: boolean } = { autoStart: true },
) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  // Screen list shown in the native macOS screen-picker overlay.
  // null = not in picking mode.
  const [nativeScreens, setNativeScreens] = useState<ScreenInfo[] | null>(null);
  // True when we are using the macOS native Rust capture path.
  const [isMacOSNative] = useState<boolean>(isMacOSTauri);

  // Keep a ref to the latest stream so the callback ref can access it
  // synchronously when the video element mounts/remounts.
  const streamRef = useRef<MediaStream | null>(null);
  // Internal ref to the actual DOM node (used by captureScreenshot)
  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  // Tracks which screen index is currently streaming on macOS
  const selectedScreenIdRef = useRef<number>(0);
  // Tracks whether the current stream captures all displays combined
  const captureAllRef = useRef<boolean>(false);
  // Tracks the current window_id (null = display capture)
  const windowIdRef = useRef<number | null>(null);
  // Hidden canvas used to composite JPEG frames from the Rust stream
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // rAF handle for the canvas draw loop — stored in a ref so the PREVIOUS
  // loop can always be cancelled even when a new stream is being started.
  const rafIdRef = useRef<number>(0);
  // WebSocket connection to the localhost frame server (macOS native path)
  const wsRef = useRef<WebSocket | null>(null);

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

  // -------------------------------------------------------------------------
  // macOS native path — streams frames from Rust via a Tauri Channel,
  // draws them onto a canvas, and exposes that canvas as a MediaStream.
  // Microphone audio is mixed in because macOS WKWebView cannot capture
  // system audio via getDisplayMedia — this gives Deepgram an audio source.
  //
  // Performance design:
  // - A single Image object is reused across all frames to avoid per-frame
  //   GC pressure from repeated `new Image()` allocations.
  // - Incoming frames are queued into `pendingFrameRef`; a single
  //   requestAnimationFrame loop drains the queue and draws to the canvas,
  //   keeping all DOM/canvas work on the next paint tick rather than blocking
  //   the message handler.
  // - canvas.captureStream(0) with manual requestVideoFrameCallback ensures
  //   the MediaStream only ticks when a new frame is actually ready.
  // -------------------------------------------------------------------------
  const startNativeStream = useCallback(async (screen: ScreenInfo) => {
    selectedScreenIdRef.current = screen.id;
    captureAllRef.current = screen.capture_all;
    windowIdRef.current = screen.window_id ?? null;
    setNativeScreens(null); // close the picker overlay

    // Cancel the previous draw loop NOW, before the new one starts,
    // so there is never a race between two loops sharing the same canvas.
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }

    // Stop any previous native stream before starting a new one
    try {
      wsRef.current?.close();
      wsRef.current = null;
      const { invoke: inv } = await import("@tauri-apps/api/core");
      await inv("stop_native_screen_stream");
    } catch { /* ignore if nothing was running */ }

    // Canvas sized to match the Rust output resolution (720×405).
    // Smaller than before (960×540) — 43 % fewer pixels to composite.
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 405;
    compositeCanvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    // Create the MediaStream NOW (before the rAF) so we can call
    // requestFrame() inside the draw callback.
    // captureStream(0) = manually driven — frames are pushed only when
    // CanvasCaptureMediaStreamTrack.requestFrame() is called.  Without
    // requestFrame(), the video element never receives new content.
    const canvasStream = (canvas as any).captureStream(0) as MediaStream;
    const videoTrack = canvasStream.getVideoTracks()[0] as any;

    // Latest pending Blob (JPEG binary) waiting to be drawn.
    let pendingFrame: Blob | null = null;
    // Backpressure flag — ensures only one createImageBitmap decode is in
    // flight at a time.  Without this, slow frames pile up and the UI lags.
    let decoding = false;

    const drawLoop = () => {
      if (pendingFrame && !decoding) {
        const blob = pendingFrame;
        pendingFrame = null;
        decoding = true;

        // createImageBitmap decodes the JPEG off the main thread in a
        // dedicated decode task, so the UI never stalls during decode.
        createImageBitmap(blob)
          .then((bitmap) => {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close(); // release GPU-side resource immediately
            videoTrack?.requestFrame?.();
            decoding = false;
          })
          .catch(() => { decoding = false; });
      }
      rafIdRef.current = requestAnimationFrame(drawLoop);
    };
    rafIdRef.current = requestAnimationFrame(drawLoop);

    // macOS WKWebView cannot provide system audio via getDisplayMedia.
    // Request microphone access and mix the audio track into the canvas
    // stream so Deepgram has a valid audio source for transcription.
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getAudioTracks().forEach((track) => {
        track.contentHint = "speech";
        canvasStream.addTrack(track);
      });
    } catch (err) {
      console.warn("Microphone access denied; audio transcription unavailable:", err);
    }

    // Replace the stream — stop old tracks, do NOT touch rafIdRef here.
    setStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop());
      return canvasStream;
    });

    // Start the Rust WebSocket frame-streaming server and connect.
    const { invoke } = await import("@tauri-apps/api/core");
    const port = await invoke<number>("start_native_screen_stream", {
      screenId: selectedScreenIdRef.current,
      captureAll: captureAllRef.current,
      windowId: windowIdRef.current,
    });

    // Close any existing WS before creating a new one.
    wsRef.current?.close();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      pendingFrame = new Blob([e.data], { type: "image/jpeg" });
    };
    wsRef.current = ws;
  }, []);

  // Called from the screen-picker overlay when the user selects a display
  const selectNativeScreen = useCallback(
    async (screen: ScreenInfo) => {
      await startNativeStream(screen);
    },
    [startNativeStream],
  );

  // -------------------------------------------------------------------------
  // startShare — entry point called from a user-gesture handler.
  // On macOS, always shows the screen-picker so the user can choose or
  // re-choose which display to share (fixes "Change Screen" flow).
  // -------------------------------------------------------------------------
  const startShare = useCallback(async () => {
    if (isMacOSTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const screens = await invoke<ScreenInfo[]>("list_screens");
        // Always show the picker — lets the user choose on first call AND
        // re-choose when "Change Screen" is pressed during an active session.
        setNativeScreens(screens);
      } catch (err) {
        console.error("Screen share error:", err);
      }
      return;
    }

    // Windows / web: use the browser's built-in getDisplayMedia (Chrome-style picker)
    try {
      const displayMediaOptions: any = {
        video: { displaySurface: "monitor" },
        cursor: "never",
        audio: { systemAudio: "include" },
      };

      // CaptureController suppresses focus-switch to the captured tab/window
      const controller =
        typeof (window as any).CaptureController !== "undefined"
          ? new (window as any).CaptureController()
          : null;
      if (controller) displayMediaOptions.controller = controller;

      const mediaStream =
        await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      if (controller?.setFocusBehavior) {
        try {
          controller.setFocusBehavior("no-focus-change");
        } catch (err) {
          console.warn("CaptureController.setFocusBehavior error:", err);
        }
      }

      setStream((prevStream) => {
        prevStream?.getTracks().forEach((track) => track.stop());
        return mediaStream;
      });
    } catch (err) {
      console.error("Screen share error:", err);
    }
  }, [startNativeStream]);

  // -------------------------------------------------------------------------
  // captureScreenshot
  // On macOS native mode: invoke the full-resolution Rust capture command.
  // On Windows / web: draw the current video frame onto a canvas.
  // -------------------------------------------------------------------------
  const captureScreenshot = useCallback((): Promise<Blob | null> => {
    if (isMacOSTauri() && stream) {
      return (async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const dataUrl = await invoke<string>("capture_screen_by_id", {
            screenId: selectedScreenIdRef.current,
            captureAll: captureAllRef.current,
            windowId: windowIdRef.current,
          });
          const res = await fetch(dataUrl);
          return await res.blob();
        } catch {
          return null;
        }
      })();
    }
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
  }, [stream]);

  // Cleanup: stop streams and the Rust capture loop on unmount
  useEffect(() => {
    return () => {
      // Stop the canvas draw loop
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      if (isMacOSTauri()) {
        wsRef.current?.close();
        wsRef.current = null;
        import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("stop_native_screen_stream"))
          .catch(() => {});
      }
      setStream((prevStream) => {
        prevStream?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, []);

  return {
    stream,
    videoRef,
    startShare,
    captureScreenshot,
    /** Non-null on macOS when the user needs to pick a display */
    nativeScreens,
    /** Call with a ScreenInfo.id to start streaming that display */
    selectNativeScreen,
    /** True when using the macOS Rust native capture path (no system audio) */
    isMacOSNative,
  };
};


