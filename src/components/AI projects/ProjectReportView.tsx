import React, { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Target,
  Layers,
  TrendingUp,
  Code2,
  Database,
  Cloud,
  Server,
  Puzzle,
  ArrowRight,
  Zap,
  Shield,
  Download,
  Layout,
  Terminal,
  Activity,
  GitBranch,
  Search,
  Package,
  Clock,
  Users,
  Network,
  Cpu,
  Workflow,
  AlertCircle,
  BarChart,
  Brain,
  MessageSquare,
  Flame,
  Construction,
  MonitorCheck,
  CheckCircle2,
  Settings,
  Code,
  GaugeCircle,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";

// ─── Type Definitions (New "Architect" Structure) ──────────────────────────

export interface ProjectResponse {
  projectHeader: {
    title: string;
    tagline: string;
    domain: string;
    duration: string;
    teamSize: string;
  };
  introduction: {
    summary: string;
    context: string;
    goal: string;
  };
  resumeReadyPoints: string[];
  howToExplain: {
    elevatorPitch: string;
    detailedExplanation: string;
  };
  businessPurpose: {
    problemStatement: string;
    businessGoal: string;
    targetUsers: string;
    successCriteria: string;
  };
  architecture: {
    overview: string;
    components: Array<{
      name: string;
      description: string;
      tech: string[];
    }>;
  };
  dataFlow: Array<{
    step: string;
    description: string;
  }>;
  codeSnippets: Array<{
    title: string;
    purpose: string;
    code: string;
  }>;
  clusterAndNodes: {
    infrastructure: string;
    details: Array<{
      component: string;
      configuration: string;
    }>;
  };
  techStack: {
    frontend: string[];
    backend: string[];
    data: string[];
    devops: string[];
    monitoring: string[];
  };
  dataCharacteristics: {
    volume: string;
    velocity: string;
    variety: string;
    veracity: string;
  };
  databaseSchema: Array<{
    table: string;
    fields: string[];
    description: string;
  }>;
  toolIntegrationMap: Array<{
    tool: string;
    role: string;
    interaction: string;
  }>;
  whyTheseTools: Array<{
    tool: string;
    reason: string;
  }>;
  methodology: {
    developmentApproach: string;
    workflow: string;
  };
  ciCdPipeline: Array<{
    stage: string;
    tools: string[];
    description: string;
  }>;
  environmentSetup: {
    development: string;
    staging: string;
    production: string;
  };
  monitoringAndAlerting: Array<{
    tool: string;
    purpose: string;
    alertType: string;
  }>;
  challengesAndResolutions: Array<{
    challenge: string;
    solution: string;
  }>;
  productionIssues: Array<{
    issue: string;
    impact: string;
    fix: string;
  }>;
  performanceOptimization: Array<{
    area: string;
    technique: string;
    result: string;
  }>;
  keyAchievements: Array<{
    metric: string;
    value: string;
    description: string;
  }>;
  technicalLearnings: string[];
}

interface ProjectReportViewProps {
  projects: ProjectResponse[];
  position?: string;
  createdAt?: string;
}

// ─── Helper Components ─────────────────────────────────────────────────────

function Card({ 
  children, 
  className, 
  title, 
  icon: Icon,
  badge
}: { 
  children: React.ReactNode; 
  className?: string; 
  title?: string;
  icon?: any;
  badge?: string;
}) {
  return (
    <div className={cn("p-6 rounded-[32px] bg-white border border-slate-100 shadow-sm transition-all", className)}>
      {(title || Icon) && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                <Icon className="h-5 w-5" />
              </div>
            )}
            {title && <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</h4>}
          </div>
          {badge && <Badge variant="outline" className="text-[9px] font-black rounded-lg border-slate-100 text-slate-400 uppercase tracking-widest">{badge}</Badge>}
        </div>
      )}
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, id, subtitle }: { icon: any; title: string; id?: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-4 mb-10 scroll-mt-24" id={id}>
      <div className="h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xl shadow-slate-900/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-1">
          {subtitle || "Technical Spec"}
        </h3>
        <h2 className="text-4xl font-black tracking-tighter text-slate-900 leading-none">
          {title}
        </h2>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────

export function ProjectReportView({ projects, position, createdAt }: ProjectReportViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("strategy");
  const reportRef = useRef<HTMLDivElement>(null);

  if (!Array.isArray(projects) || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 text-center bg-card rounded-[48px] border border-dashed border-border/60">
        <Construction className="h-24 w-24 text-primary/10 mb-8 animate-pulse" />
        <h3 className="text-4xl font-black text-slate-900 tracking-tighter">Initializing Architect...</h3>
        <p className="text-slate-500 mt-2 max-w-sm font-medium">Drafting production-grade project documentation based on your technical profile.</p>
      </div>
    );
  }

  const project = projects[activeIndex];

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.text(`Project Architecture Report: ${project.projectHeader?.title || "Report"}`, 10, 10);
    doc.save(`${(project.projectHeader?.title || "Project").replace(/\s+/g, "_")}_System_Design.pdf`);
  };

  const tabs = [
    { id: "strategy", label: "Strategic Context", icon: Target },
    { id: "architecture", label: "Engineering Design", icon: Layers },
    { id: "ops", label: "Operations & DevOps", icon: Activity },
    { id: "results", label: "Results & Metrics", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-12 min-h-screen pb-20 animate-in fade-in duration-700">
      
      {/* ── Dashboard Header ── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-[24px] bg-slate-900 flex items-center justify-center text-white shadow-2xl shadow-slate-900/20">
            <Layout className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 leading-none mb-2 uppercase">Project Portfolio</h1>
            <div className="flex items-center gap-2">
              <Badge className="bg-primary/10 text-primary border-none font-black text-[10px] px-3">ARCHITECT MODE</Badge>
              <span className="text-[10px] font-bold text-slate-300 tracking-widest uppercase">System v4.0.2</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <Button
            onClick={handleDownloadPDF}
            className="h-14 px-8 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 font-black text-xs tracking-[0.15em] gap-3 shadow-sm active:scale-95 transition-all"
          >
            <Download className="h-4 w-4" />
            PDF EXPORT
          </Button>
          <Button
            className="h-14 px-8 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs tracking-[0.15em] gap-3 shadow-xl shadow-slate-900/20 active:scale-95 transition-all"
          >
            <Share2 className="h-4 w-4" />
            SHARE REPORT
          </Button>
        </div>
      </div>

      {/* ── Project Selection ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {projects.map((p, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              "p-8 rounded-[40px] transition-all border-2 text-left group relative overflow-hidden",
              i === activeIndex
                ? "bg-slate-900 text-white border-slate-900 shadow-2xl shadow-slate-200"
                : "bg-white text-slate-400 hover:bg-slate-50 border-slate-100",
            )}
          >
            <span className={cn(
              "text-[10px] font-black uppercase tracking-[0.3em] mb-4 block",
              i === activeIndex ? "text-primary" : "text-slate-300",
            )}>
              {p.projectHeader?.domain || "Engineering"}
            </span>
            <h3 className="text-xl font-black tracking-tighter leading-tight relative z-10 mb-2">
              {p.projectHeader?.title || `System 0${i + 1}`}
            </h3>
            <p className={cn("text-xs font-bold line-clamp-1 opacity-60", i === activeIndex ? "text-slate-300" : "text-slate-400")}>
              {p.projectHeader?.tagline}
            </p>
          </button>
        ))}
      </div>

      {/* ── Main Dashboard Container ── */}
      <div className="max-w-7xl mx-auto w-full">
        <div ref={reportRef} className="bg-white border border-slate-200/60 rounded-[56px] shadow-2xl shadow-slate-200/50 overflow-hidden">
          
          {/* Hero Banner */}
          <div className="p-12 md:p-20 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100 flex flex-col md:flex-row gap-16 items-start">
             <div className="flex-1 space-y-8">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-12 bg-primary rounded-full" />
                  <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Project Profile</span>
                </div>
                <div className="space-y-4">
                  <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-slate-900 leading-[0.8]">
                    {project.projectHeader?.title}
                  </h1>
                  <p className="text-2xl font-bold text-slate-500 max-w-2xl leading-snug">
                    {project.projectHeader?.tagline}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 pt-4">
                  {[
                    { icon: Clock, label: "Duration", value: project.projectHeader?.duration },
                    { icon: Users, label: "Team", value: project.projectHeader?.teamSize },
                    { icon: Globe, label: "Domain", value: project.projectHeader?.domain },
                  ].map((stat, i) => (
                    <div key={i} className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-100 rounded-[20px] shadow-sm">
                      <stat.icon className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">{stat.label}</p>
                        <p className="text-xs font-black text-slate-900">{stat.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
             
             {/* Resume Ready Points */}
             <div className="w-full md:w-[400px] space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Resume Highlights</h4>
                <div className="space-y-3">
                  {project.resumeReadyPoints?.map((point, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-700 leading-relaxed hover:bg-white hover:shadow-md transition-all group flex gap-3">
                       <Zap className="h-4 w-4 text-primary shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                       {point}
                    </div>
                  ))}
                </div>
             </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-12 md:px-20 py-6 border-b border-slate-100 bg-slate-50/50 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "whitespace-nowrap px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3",
                    activeTab === tab.id 
                      ? "bg-slate-900 text-white shadow-xl shadow-slate-900/10" 
                      : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="hidden lg:flex items-center gap-3">
               <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Active Report</span>
               <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>

          {/* Content Body */}
          <div className="p-12 md:p-20">
            
            {/* ━━ TAB: STRATEGY ━━ */}
            {activeTab === "strategy" && (
              <div className="space-y-20 animate-in slide-in-from-bottom-4 duration-500">
                <section>
                  <SectionTitle icon={Target} title="Strategic Context" subtitle="Market & Purpose" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card title="Introduction" icon={Brain}>
                      <p className="text-lg font-bold text-slate-700 leading-relaxed mb-6">{project.introduction?.summary}</p>
                      <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-slate-50">
                           <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Original Context</p>
                           <p className="text-sm font-bold text-slate-600">{project.introduction?.context}</p>
                        </div>
                      </div>
                    </Card>
                    <Card title="Elevator Pitch" icon={MessageSquare} className="bg-primary/5 border-primary/10">
                       <p className="text-xl font-black text-slate-900 leading-tight italic">"{project.howToExplain?.elevatorPitch}"</p>
                       <Separator className="my-6 bg-primary/20" />
                       <h5 className="text-[9px] font-black text-primary uppercase mb-3">Interview Deep Dive</h5>
                       <p className="text-sm font-bold text-slate-600 leading-relaxed">{project.howToExplain?.detailedExplanation}</p>
                    </Card>
                  </div>
                </section>

                <section>
                  <Card className="p-12 border-none bg-slate-900 text-white relative overflow-hidden">
                    <Flame className="absolute -bottom-10 -right-10 h-64 w-64 text-white/5" />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12 relative z-10">
                       <div className="md:col-span-2 space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Problem Statement</h4>
                          <p className="text-3xl font-black tracking-tight">{project.businessPurpose?.problemStatement}</p>
                       </div>
                       <div className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Success Criteria</h4>
                          <p className="text-sm font-bold text-slate-300 leading-relaxed">{project.businessPurpose?.successCriteria}</p>
                       </div>
                       <div className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Target Users</h4>
                          <p className="text-sm font-bold text-slate-300 leading-relaxed">{project.businessPurpose?.targetUsers}</p>
                       </div>
                    </div>
                  </Card>
                </section>
              </div>
            )}

            {/* ━━ TAB: ARCHITECTURE ━━ */}
            {activeTab === "architecture" && (
              <div className="space-y-24 animate-in slide-in-from-bottom-4 duration-500">
                <section>
                  <SectionTitle icon={Layers} title="System Architecture" subtitle="Structural Design" />
                  <div className="space-y-12">
                     <div className="p-10 rounded-[48px] bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3 mb-6">
                           <Network className="h-6 w-6 text-primary" />
                           <h4 className="text-2xl font-black tracking-tight">Overview</h4>
                        </div>
                        <p className="text-lg font-bold text-slate-600 leading-relaxed max-w-4xl">{project.architecture?.overview}</p>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {project.architecture?.components?.map((comp, i) => (
                          <div key={i} className="p-8 rounded-[40px] bg-white border border-slate-100 shadow-sm hover:shadow-xl transition-all group">
                             <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Puzzle className="h-5 w-5" />
                             </div>
                             <h5 className="text-xl font-black mb-3">{comp.name}</h5>
                             <p className="text-xs font-bold text-slate-500 leading-relaxed mb-6">{comp.description}</p>
                             <div className="flex flex-wrap gap-2">
                                {comp.tech?.map((t, idx) => <Badge key={idx} variant="outline" className="text-[9px] font-bold rounded-lg">{t}</Badge>)}
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={Activity} title="Technical Characteristics" subtitle="Scale & Dynamics" />
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                      { label: "Volume", value: project.dataCharacteristics?.volume, color: "text-blue-600" },
                      { label: "Velocity", value: project.dataCharacteristics?.velocity, color: "text-emerald-600" },
                      { label: "Variety", value: project.dataCharacteristics?.variety, color: "text-purple-600" },
                      { label: "Veracity", value: project.dataCharacteristics?.veracity, color: "text-amber-600" },
                    ].map((stat, i) => (
                      <div key={i} className="p-8 rounded-[40px] border border-slate-100 bg-slate-50/30 text-center">
                        <p className={cn("text-xs font-black uppercase tracking-widest mb-3", stat.color)}>{stat.label}</p>
                        <p className="text-xl font-black text-slate-900 leading-tight">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle icon={Database} title="Data Schema" subtitle="Entity Relationships" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {project.databaseSchema?.map((db, i) => (
                      <div key={i} className="rounded-[40px] border border-slate-100 overflow-hidden group hover:border-primary/30 transition-all">
                        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                           <div className="flex items-center gap-3">
                             <Database className="h-5 w-5 text-primary" />
                             <span className="text-lg font-black">{db.table}</span>
                           </div>
                           <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">PostgreSQL Entity</span>
                        </div>
                        <div className="p-8 space-y-6">
                           <div className="flex flex-wrap gap-2">
                              {db.fields?.map((f, idx) => <Badge key={idx} className="bg-slate-100 hover:bg-slate-100 text-slate-600 border-none font-bold text-[10px] px-3">{f}</Badge>)}
                           </div>
                           <p className="text-sm font-bold text-slate-400 italic leading-relaxed border-l-2 border-slate-100 pl-4">
                             {db.description}
                           </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle icon={Code2} title="Reference Implementation" subtitle="Core Logic" />
                  <div className="space-y-8">
                     {project.codeSnippets?.map((snippet, i) => (
                        <div key={i} className="rounded-[40px] bg-slate-900 p-2 shadow-2xl overflow-hidden">
                           <div className="p-6 flex items-center justify-between border-b border-white/5">
                              <div className="flex items-center gap-4">
                                <div className="flex gap-2">
                                  <div className="h-3 w-3 rounded-full bg-rose-500" />
                                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                                </div>
                                <h5 className="text-sm font-black text-white ml-4">{snippet.title}</h5>
                              </div>
                              <Badge className="bg-white/10 text-white border-none font-black text-[9px] uppercase">{snippet.purpose}</Badge>
                           </div>
                           <div className="p-10 overflow-x-auto">
                              <pre className="text-sm font-mono leading-relaxed text-emerald-400">
                                <code>{snippet.code}</code>
                              </pre>
                           </div>
                        </div>
                     ))}
                  </div>
                </section>
                <section>
                  <SectionTitle icon={Settings} title="Technology Stack" subtitle="Core Tools & Frameworks" />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {Object.entries(project.techStack || {}).map(([category, tools], i) => (
                        <div key={i} className="p-8 rounded-[32px] bg-white border border-slate-100 hover:shadow-lg transition-all">
                           <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">{category}</h5>
                           <div className="flex flex-wrap gap-2">
                              {Array.isArray(tools) ? tools.map((t, idx) => (
                                 <Badge key={idx} variant="secondary" className="bg-primary/5 text-primary border-none hover:bg-primary/10">{t}</Badge>
                              )) : null}
                           </div>
                        </div>
                     ))}
                  </div>
                </section>

                <section>
                   <SectionTitle icon={Workflow} title="Data Flow" subtitle="System Sequence" />
                   <div className="space-y-4">
                      {project.dataFlow?.map((flow, i) => (
                         <div key={i} className="p-6 rounded-[24px] bg-slate-50 border border-slate-100 flex items-start gap-6">
                            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-black text-slate-900 shrink-0">
                               {i + 1}
                            </div>
                            <div>
                               <h5 className="text-sm font-black mb-1">{flow.step}</h5>
                               <p className="text-xs font-bold text-slate-500 leading-relaxed">{flow.description}</p>
                            </div>
                         </div>
                      ))}
                   </div>
                </section>

                <section>
                   <SectionTitle icon={Puzzle} title="Tool Integrations" subtitle="Architecture Rationale" />
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Integration Map</h4>
                         {project.toolIntegrationMap?.map((ti, i) => (
                            <div key={i} className="p-6 rounded-[32px] bg-white border border-slate-100">
                               <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-black">{ti.tool}</span>
                                  <Badge variant="outline" className="text-[9px] uppercase">{ti.role}</Badge>
                               </div>
                               <p className="text-xs font-bold text-slate-500">{ti.interaction}</p>
                            </div>
                         ))}
                      </div>
                      <div className="space-y-6">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Why These Tools</h4>
                         {project.whyTheseTools?.map((wt, i) => (
                            <div key={i} className="p-6 rounded-[32px] bg-slate-900 text-white border border-slate-800">
                               <h5 className="text-sm font-black text-primary mb-2">{wt.tool}</h5>
                               <p className="text-xs font-bold text-slate-400 leading-relaxed">{wt.reason}</p>
                            </div>
                         ))}
                      </div>
                   </div>
                </section>
              </div>
            )}

            {/* ━━ TAB: OPS & DEVOPS ━━ */}
            {activeTab === "ops" && (
              <div className="space-y-24 animate-in slide-in-from-bottom-4 duration-500">
                <section>
                  <SectionTitle icon={Cloud} title="Infrastructure & Setup" subtitle="Nodes & Cluster" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                     <div className="space-y-8">
                        <Card title="Architecture Paradigm" icon={Server}>
                           <p className="text-lg font-bold text-slate-700 leading-relaxed">{project.clusterAndNodes?.infrastructure}</p>
                        </Card>
                        <div className="space-y-4">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Environment Setup</h4>
                           <div className="grid grid-cols-3 gap-4">
                              {['development', 'staging', 'production'].map((env) => (
                                <div key={env} className="p-6 rounded-[28px] bg-slate-50 border border-slate-100 text-center flex flex-col items-center justify-center">
                                   <p className="text-[10px] font-black text-slate-400 uppercase mb-2">{env}</p>
                                   {project.environmentSetup?.[env as keyof typeof project.environmentSetup] ? (
                                      <p className="text-[11px] font-bold text-slate-600 leading-tight">{project.environmentSetup[env as keyof typeof project.environmentSetup]}</p>
                                   ) : (
                                      <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[9px]">ACTIVE</Badge>
                                   )}
                                </div>
                              ))}
                           </div>
                        </div>
                     </div>
                     <div className="space-y-6">
                        {project.clusterAndNodes?.details?.map((detail, i) => (
                           <div key={i} className="p-6 rounded-[32px] bg-white border border-slate-100 flex items-center justify-between group hover:border-primary/20 transition-all">
                              <div className="flex items-center gap-4">
                                 <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-primary transition-all">
                                    <Cpu className="h-5 w-5" />
                                 </div>
                                 <div>
                                    <p className="text-sm font-black text-slate-900">{detail.component}</p>
                                    <p className="text-xs font-bold text-slate-400">{detail.configuration}</p>
                                 </div>
                              </div>
                              <ChevronRight className="h-5 w-5 text-slate-200" />
                           </div>
                        ))}
                     </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={GitBranch} title="CI/CD Pipeline" subtitle="Automation Flow" />
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {project.ciCdPipeline?.map((pipe, i) => (
                      <div key={i} className="relative group">
                         <div className="p-8 rounded-[40px] bg-white border border-slate-100 h-full hover:shadow-xl transition-all">
                            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 font-black text-xs">0{i+1}</div>
                            <h5 className="text-lg font-black mb-4">{pipe.stage}</h5>
                            <p className="text-xs font-bold text-slate-500 leading-relaxed mb-6">{pipe.description}</p>
                            <div className="flex flex-wrap gap-2">
                               {pipe.tools?.map((t, idx) => <Badge key={idx} variant="outline" className="text-[9px] font-bold border-primary/20 text-primary uppercase">{t}</Badge>)}
                            </div>
                         </div>
                         {i < (project.ciCdPipeline?.length - 1) && (
                            <ArrowRight className="hidden md:block absolute -right-6 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-200 z-10" />
                         )}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle icon={MonitorCheck} title="Observability" subtitle="Monitoring & Alerts" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                     {project.monitoringAndAlerting?.map((mon, i) => (
                       <Card key={i} title={mon.tool} icon={Activity} badge={mon.alertType}>
                          <p className="text-sm font-bold text-slate-600 leading-relaxed">{mon.purpose}</p>
                       </Card>
                     ))}
                  </div>
                </section>
                 <section>
                    <SectionTitle icon={Layers} title="Methodology" subtitle="Development Approach" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <Card title="Development Approach" icon={Target}>
                          <p className="text-base font-bold text-slate-700 leading-relaxed">{project.methodology?.developmentApproach}</p>
                       </Card>
                       <Card title="Workflow" icon={Activity}>
                          <p className="text-base font-bold text-slate-700 leading-relaxed">{project.methodology?.workflow}</p>
                       </Card>
                    </div>
                 </section>
              </div>
            )}

            {/* ━━ TAB: RESULTS ━━ */}
            {activeTab === "results" && (
              <div className="space-y-24 animate-in slide-in-from-bottom-4 duration-500">
                 <section>
                    <SectionTitle icon={Zap} title="Performance Optimization" subtitle="Efficiency Gains" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       {project.performanceOptimization?.map((po, i) => (
                          <div key={i} className="p-8 rounded-[32px] bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20">
                             <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">{po.area}</h5>
                             <p className="text-2xl font-black text-slate-900 mb-4">{po.result}</p>
                             <p className="text-xs font-bold text-slate-600 leading-relaxed">{po.technique}</p>
                          </div>
                       ))}
                    </div>
                 </section>

                 <section>
                  <SectionTitle icon={BarChart} title="Performance Benchmarks" subtitle="Quantifiable Success" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                     {project.keyAchievements?.map((ach, i) => (
                       <div key={i} className="p-10 rounded-[48px] bg-slate-900 text-white relative overflow-hidden group">
                          <TrendingUp className="absolute -bottom-10 -right-10 h-40 w-40 text-white/5 group-hover:scale-110 transition-transform" />
                          <div className="relative z-10 space-y-6">
                             <div className="h-12 w-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center font-black">
                                <Sparkles className="h-6 w-6" />
                             </div>
                             <div className="space-y-2">
                                <h5 className="text-5xl font-black tracking-tighter text-primary">{ach.value}</h5>
                                <p className="text-xs font-black uppercase tracking-widest text-white/40">{ach.metric}</p>
                             </div>
                             <p className="text-sm font-bold text-slate-400 leading-relaxed">{ach.description}</p>
                          </div>
                       </div>
                     ))}
                  </div>
                 </section>

                <section>
                  <SectionTitle icon={Shield} title="Engineering Resilience" subtitle="Challenges & Resolutions" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Strategic Resolutions</h4>
                      {project.challengesAndResolutions?.map((cr, i) => (
                        <div key={i} className="p-8 rounded-[40px] bg-white border border-slate-100 space-y-4">
                           <div className="flex items-center gap-3 text-rose-500">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Challenge</span>
                           </div>
                           <p className="text-base font-black text-slate-900 italic">"{cr.challenge}"</p>
                           <Separator className="bg-slate-100" />
                           <div className="flex items-center gap-3 text-emerald-500">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Architecture Fix</span>
                           </div>
                           <p className="text-sm font-bold text-slate-600 leading-relaxed">{cr.solution}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Production Stability</h4>
                      {project.productionIssues?.map((pi, i) => (
                        <div key={i} className="p-8 rounded-[40px] bg-slate-50 border border-slate-100 space-y-4">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 text-slate-900">
                                <Flame className="h-4 w-4" />
                                <span className="text-sm font-black">{pi.issue}</span>
                              </div>
                              <Badge className="bg-rose-500 text-white border-none font-black text-[9px] uppercase">{pi.impact}</Badge>
                           </div>
                           <p className="text-xs font-bold text-slate-500 leading-relaxed">{pi.fix}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                   <SectionTitle icon={Brain} title="Technical Learnings" subtitle="Post-Implementation Review" />
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {project.technicalLearnings?.map((learn, i) => (
                        <div key={i} className="p-8 rounded-[40px] bg-white border border-slate-100 shadow-sm hover:border-primary/20 transition-all flex items-start gap-4">
                           <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-black text-xs">{i+1}</div>
                           <p className="text-sm font-bold text-slate-700 leading-relaxed pt-1">{learn}</p>
                        </div>
                      ))}
                   </div>
                </section>
              </div>
            )}

            {/* Footer */}
            <footer className="pt-32 border-t border-slate-100 flex flex-col items-center gap-6">
               <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl shadow-slate-900/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <span className="font-black text-3xl tracking-tighter text-slate-900 uppercase">
                  Craft Vita AI
                </span>
              </div>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black text-slate-300 tracking-[0.4em] uppercase">
                  CONFIDENTIAL ENGINEERING SPECIFICATION • AUTH: {(project.projectHeader?.title || "SYST").substring(0, 4).toUpperCase()}
                </p>
                <p className="text-[9px] font-bold text-slate-400">© 2024 Craft Vita AI Systems. All rights reserved.</p>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Missing Icons ─────────────────────────────────────────────────────────
function ChevronRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function Share2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </svg>
  );
}

function Globe(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

const Separator = ({ className }: { className?: string }) => (
  <div className={cn("h-px w-full bg-slate-100", className)} />
);
