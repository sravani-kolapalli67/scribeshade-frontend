import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

const BACKEND_UPDATES_MANIFEST_URL = `${import.meta.env.VITE_BACKEND_URL
  }/api/updates/latest.json`;

type UpdateManifest = {
  platforms?: Record<string, { url: string; signature?: string }>;
};

async function openLatestDesktopDownload(
  platform: "mac" | "windows",
  format?: "exe" | "msi",
) {
  try {
    const res = await fetch(BACKEND_UPDATES_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok)
      throw new Error(`Failed to fetch latest manifest (${res.status})`);
    const manifest = (await res.json()) as UpdateManifest;
    const platforms = manifest.platforms ?? {};
    const entries = Object.entries(platforms);

    let match;

    if (platform === "mac") {
      match = entries.find(([key]) => key.toLowerCase().includes("darwin"));
    } else {
      // For Windows, try to match the specific format (exe/nsis or msi)
      if (format === "msi") {
        match = entries.find(([key]) => key.toLowerCase().includes("msi"));
      } else if (format === "exe") {
        match = entries.find(([key]) => key.toLowerCase().includes("nsis"));
      }

      // Fallback to any windows platform if specific format not found
      if (!match) {
        match = entries.find(([key]) => key.toLowerCase().includes("windows"));
      }
    }

    const url = match?.[1]?.url;
    if (!url)
      throw new Error(`No ${platform} download found in latest manifest`);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("[download] Unable to open latest desktop download:", error);
    window.open(BACKEND_UPDATES_MANIFEST_URL, "_blank", "noopener,noreferrer");
  }
}

export function DownloadApp() {
  return (
    <div className="w-full max-w-6xl mx-auto py-8 sm:py-12 px-5 sm:px-8 bg-linear-to-br from-brand to-blue-700 rounded-2xl sm:rounded-3xl overflow-hidden relative shadow-2xl shadow-brand/20 my-4 sm:my-8 border border-white/10">
      {/* Background decorative blobs */}
      <div className="absolute top-0 -left-1/4 w-1/2 h-full bg-white/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 -right-1/4 w-1/2 h-full bg-blue-400/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
        <div className="flex-1 text-center lg:text-left space-y-4">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
            Take ScribeShade Anywhere
          </h2>
          <p className="text-blue-50 text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed font-medium">
            Get the full power of ScribeShade with native performance, global
            shortcuts, and seamless interview assistance directly from your
            desktop.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto shrink-0 justify-center">
          <Button
            size="lg"
            type="button"
            onClick={() => void openLatestDesktopDownload("mac")}
            className="w-full sm:w-auto h-14 px-8 bg-white hover:bg-blue-50 text-brand group rounded-xl transition-all font-bold"
          >
            <AppleIcon className="w-5 h-5 mr-3 transition-transform group-hover:-translate-y-0.5" />
            Download for Mac
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="lg"
                type="button"
                className="w-full sm:w-auto h-14 px-8 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 group rounded-xl transition-all font-semibold shadow-lg flex items-center justify-center"
              >
                <WindowsIcon className="w-5 h-5 mr-3 transition-transform group-hover:-translate-y-0.5 text-[#00a4ef]" />
                Download for Windows
                <ChevronDown className="ml-3 h-4 w-4 opacity-70 group-hover:translate-y-0.5 transition-transform" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-64 bg-zinc-950 border-white/10 text-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-1.5 backdrop-blur-xl"
            >
              <DropdownMenuItem
                onClick={() => void openLatestDesktopDownload("windows", "exe")}
                className="group cursor-pointer rounded-xl py-3 px-4 flex flex-col items-start gap-1 transition-all outline-none border-none hover:bg-white/10 focus:bg-white/10 data-[highlighted]:bg-white/10 [&_*]:!text-white"
              >
                <span className="font-bold text-sm">Windows (AMD/EXE)</span>
                <span className="text-xs text-zinc-400">
                  Standard installer for most users
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void openLatestDesktopDownload("windows", "msi")}
                className="group cursor-pointer rounded-xl py-3 px-4 flex flex-col items-start gap-1 transition-all outline-none border-none hover:bg-white/10 focus:bg-white/10 data-[highlighted]:bg-white/10 [&_*]:!text-white"
              >
                <span className="font-bold text-sm">Windows (Intel/MSI)</span>
                <span className="text-xs text-zinc-400">
                  Ideal for enterprise/corporate installs
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function AppleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 384 512" fill="currentColor" {...props}>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function WindowsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 448 512" fill="currentColor" {...props}>
      <path d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 324.6l183.6 25.3V268.4H0v149.9zm203.8 28L448 480V268.4H203.8v177.9zm0-380.6v180.1H448V32L203.8 65.7z" />
    </svg>
  );
}
