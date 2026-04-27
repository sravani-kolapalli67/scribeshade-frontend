import { Button } from "@/components/ui/button";
import { ScreenShare, Maximize2, Minimize2, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScreenInfo } from "@/hooks/useScreenShare";

interface ScreenCaptureProps {
  stream: MediaStream | null;
  // Callback ref from useScreenShare — re-attaches the stream whenever
  // this element mounts or remounts (e.g. after a fullscreen toggle).
  videoRef: React.RefCallback<HTMLVideoElement>;
  onChangeTab: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Non-null on macOS when the user must select a display */
  nativeScreens?: ScreenInfo[] | null;
  /** Call with a ScreenInfo object to start streaming that display */
  selectNativeScreen?: (screen: ScreenInfo) => void;
  /** True when using the macOS Rust native capture path */
  isMacOSNative?: boolean;
}

export const ScreenCapture = ({
  stream,
  videoRef,
  onChangeTab,
  isFullscreen = false,
  onToggleFullscreen,
  nativeScreens,
  selectNativeScreen,
  isMacOSNative = false,
}: ScreenCaptureProps) => {
  return (
    <div
      className={cn(
        "bg-slate-900 overflow-hidden group/video",
        isFullscreen
          ? "fixed inset-0 z-0"
          : "relative h-full rounded-none border-b border-slate-200",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "w-full h-full object-contain bg-black",
          !stream && "hidden",
        )}
      />

      {/* Native macOS screen-picker overlay */}
      {nativeScreens && nativeScreens.length > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-slate-900/95 backdrop-blur-sm z-20 p-6 overflow-y-auto">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <Monitor className="h-8 w-8 text-white/60" />
            <p className="text-white font-semibold text-base">Choose what to share</p>
            <p className="text-white/50 text-xs">Share your entire screen or a specific display</p>
          </div>

          {/* Entire Screen section */}
          {nativeScreens.filter((s) => s.capture_all).map((screen) => (
            <div key="entire-screen" className="w-full max-w-md">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Entire Screen</p>
              <button
                onClick={() => selectNativeScreen?.(screen)}
                className="w-full flex items-center gap-4 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-400/60 transition-all cursor-pointer text-left"
              >
                <img
                  src={screen.thumbnail}
                  alt="Entire Screen"
                  className="h-16 object-contain rounded-lg border border-white/10 flex-shrink-0"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-white font-semibold text-sm">Entire Screen</span>
                  <span className="text-white/40 text-xs">{screen.width}×{screen.height} — all displays</span>
                </div>
              </button>
            </div>
          ))}

          {/* Individual display section */}
          {nativeScreens.filter((s) => !s.capture_all && s.window_id == null).length > 0 && (
            <div className="w-full max-w-2xl">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Specific Display</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {nativeScreens
                  .filter((s) => !s.capture_all && s.window_id == null)
                  .map((screen) => (
                    <button
                      key={screen.id}
                      onClick={() => selectNativeScreen?.(screen)}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-400/60 transition-all cursor-pointer group/screen"
                    >
                      <div className="relative">
                        <img
                          src={screen.thumbnail}
                          alt={screen.name}
                          className="w-40 h-24 object-cover rounded-lg border border-white/10"
                        />
                        {screen.is_primary && (
                          <span className="absolute top-1 right-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            Primary
                          </span>
                        )}
                      </div>
                      <span className="text-white/70 text-xs font-medium group-hover/screen:text-white transition-colors">
                        {screen.name}
                        <span className="text-white/40 ml-1">
                          {screen.width}×{screen.height}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Application windows section */}
          {nativeScreens.filter((s) => s.window_id != null).length > 0 && (
            <div className="w-full max-w-2xl">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Application Window</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {nativeScreens
                  .filter((s) => s.window_id != null)
                  .map((screen) => (
                    <button
                      key={screen.window_id}
                      onClick={() => selectNativeScreen?.(screen)}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-emerald-400/60 transition-all cursor-pointer group/screen max-w-[180px]"
                    >
                      <div className="relative">
                        {screen.thumbnail ? (
                          <img
                            src={screen.thumbnail}
                            alt={screen.name}
                            className="w-40 h-24 object-cover rounded-lg border border-white/10"
                          />
                        ) : (
                          <div className="w-40 h-24 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center">
                            <Monitor className="h-6 w-6 text-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-0.5 w-full">
                        <span className="text-white/80 text-[11px] font-semibold group-hover/screen:text-white transition-colors truncate w-full text-center">
                          {screen.app_name}
                        </span>
                        {screen.name !== screen.app_name && (
                          <span className="text-white/40 text-[10px] truncate w-full text-center">
                            {screen.name.replace(`${screen.app_name} — `, "")}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!stream && !nativeScreens && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900">
          <div className="h-16 w-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
            <ScreenShare className="h-8 w-8 text-white/20" />
          </div>
          <p className="text-sm text-white/40 font-medium">
            Waiting for screen capture...
          </p>
        </div>
      )}

      {/* Floating Controls — always visible so user can toggle back */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggleFullscreen}
          className="h-8 bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 rounded-lg px-3 text-xs font-bold"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
          {isFullscreen ? "Exit Fullscreen" : "Full screen"}
        </Button>
        {!isFullscreen && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onChangeTab}
            className="h-8 bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 rounded-lg px-3 text-xs font-bold"
          >
            {isMacOSNative ? "Change Screen" : "Change Tab"}
          </Button>
        )}
      </div>
    </div>
  );
};
