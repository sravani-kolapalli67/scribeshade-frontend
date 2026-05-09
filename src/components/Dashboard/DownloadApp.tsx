import { Button } from "@/components/ui/button";

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
            className="w-full sm:w-auto h-14 px-8 bg-white hover:bg-blue-50 text-brand group rounded-xl transition-all font-bold"
          >
            <AppleIcon className="w-5 h-5 mr-3 transition-transform group-hover:-translate-y-0.5" />
            Download for Mac
          </Button>
          <Button
            size="lg"
            className="w-full sm:w-auto h-14 px-8 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 group rounded-xl transition-all font-semibold shadow-lg"
          >
            <WindowsIcon className="w-5 h-5 mr-3 transition-transform group-hover:-translate-y-0.5 text-[#00a4ef]" />
            Download for Windows
          </Button>
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
