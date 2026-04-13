import { Sparkles, FilePlus, Target, Zap } from "lucide-react";

export default function BuildResume() {
  return (
    <div className="space-y-12 max-w-5xl mx-auto py-12">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
          <Sparkles className="h-3 w-3" />
          AI Powered
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Build a Winning Resume</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Our AI-powered builder helps you craft a professional resume tailored to your dream job in minutes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-8 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4 transition-all hover:shadow-md">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Target className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold">Tailored Content</h3>
          <p className="text-muted-foreground text-sm">
            Paste a job description and our AI will optimize your resume for specific keywords and requirements.
          </p>
        </div>

        <div className="p-8 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4 transition-all hover:shadow-md">
          <div className="h-12 w-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <Zap className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold">Instant Extraction</h3>
          <p className="text-muted-foreground text-sm">
            Save time by extracting work history and education directly from your existing PDF or Word files.
          </p>
        </div>

        <div className="p-8 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4 transition-all hover:shadow-md">
          <div className="h-12 w-12 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center">
            <FilePlus className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold">Premium Templates</h3>
          <p className="text-muted-foreground text-sm">
            Choose from a library of ATS-friendly templates designed to get you noticed by top recruiters.
          </p>
        </div>
      </div>

      <div className="p-12 rounded-3xl bg-black dark:bg-white text-white dark:text-black flex flex-col items-center text-center space-y-6">
        <h2 className="text-3xl font-bold">Ready to stand out?</h2>
        <p className="opacity-80 max-w-md">
          Click the "Build Resume" button in the navigation bar to start your journey with our multi-step wizard.
        </p>
        <div className="pt-4 flex items-center gap-2 text-sm font-medium animate-pulse">
          Look up <FilePlus className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
