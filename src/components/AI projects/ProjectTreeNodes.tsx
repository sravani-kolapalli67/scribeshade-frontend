import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Monitor,
  Layers,
  Workflow,
  Wrench,
  Users,
  Target,
  Database,
  HardDrive,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Clock,
  Code2,
  Layout,
  Server,
  Shield,
  Lock,
  Cpu,
  Send,
  Search,
  Cloud,
  GitBranch,
  MessageCircle,
  PenTool,
  BookOpen,
  Zap,
  Box,
  Radio,
  Rocket,
  RefreshCw,
  FileCode,
  BarChart2,
  Activity,
  GitMerge,
  TrendingUp,
  Palette,
  ArrowRightLeft,
  ShieldAlert,
  CheckCircle,
  UserPlus,
  Fingerprint,
  Calendar,
  Stethoscope,
  Brain,
  FileCheck,
  BarChart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  SystemProject,
  ArchitectureLayer,
  FlowStep,
  TechCategory,
  CollabTool,
  DataDomain,
  DatabaseTable,
} from "./data";

// ─── Icon Resolver ──────────────────────────────────────────────────────────

const iconMap: Record<string, any> = {
  monitor: Monitor,
  layout: Layout,
  code: Code2,
  "code-2": Code2,
  "file-code": FileCode,
  palette: Palette,
  box: Box,
  server: Server,
  zap: Zap,
  rocket: Rocket,
  database: Database,
  "hard-drive": HardDrive,
  search: Search,
  container: Box,
  "git-branch": GitBranch,
  cloud: Cloud,
  "message-circle": MessageCircle,
  "pen-tool": PenTool,
  "book-open": BookOpen,
  radio: Radio,
  "refresh-cw": RefreshCw,
  cpu: Cpu,
  layers: Layers,
  activity: Activity,
  "bar-chart": BarChart,
  "bar-chart-2": BarChart2,
  "trending-up": TrendingUp,
  "git-merge": GitMerge,
  send: Send,
  "arrow-right-left": ArrowRightLeft,
  "shield-alert": ShieldAlert,
  "check-circle": CheckCircle,
  user: UserPlus,
  "user-plus": UserPlus,
  fingerprint: Fingerprint,
  calendar: Calendar,
  stethoscope: Stethoscope,
  brain: Brain,
  "file-check": FileCheck,
  shield: Shield,
  lock: Lock,
  kanban: Layers,
};

function resolveIcon(key: string) {
  return iconMap[key] || Code2;
}

// ─── Difficulty Color Map ────────────────────────────────────────────────────

const difficultyStyles: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  intermediate: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  advanced: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  1. PROJECT HEADER NODE — collapsible, on the canvas
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectHeaderNode({ data }: any) {
  const project: SystemProject = data.project;
  const isExpanded: boolean = data.isExpanded;

  return (
    <div
      onClick={() => data.onToggle?.(project.id)}
      className={`relative min-w-[280px] max-w-[320px] rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group select-none
        ${isExpanded
          ? "bg-primary text-primary-foreground shadow-2xl scale-[1.02]"
          : "bg-card border border-border/60 shadow-md hover:shadow-xl hover:border-brand/40 hover:-translate-y-0.5"
        }`}
    >
      {/* Brand gradient left strip */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 ${
          isExpanded
            ? "bg-gradient-to-b from-white/40 via-white/20 to-white/40"
            : "bg-gradient-to-b from-brand via-brand-hover to-brand-active"
        }`}
      />

      <div className="pl-6 pr-5 py-5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                isExpanded ? "bg-white/20" : "bg-brand/10"
              }`}
            >
              <Monitor
                className={`h-5 w-5 ${isExpanded ? "text-primary-foreground" : "text-brand"}`}
              />
            </div>
            <div>
              <div
                className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${
                  isExpanded ? "opacity-70" : "text-muted-foreground"
                }`}
              >
                Project
              </div>
              <div className="font-bold text-base leading-tight truncate max-w-[180px]">
                {project.title}
              </div>
            </div>
          </div>

          {/* Expand/Collapse chevron */}
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-transform duration-300 ${
              isExpanded
                ? "rotate-180 bg-white/10"
                : "bg-secondary"
            }`}
          >
            <ChevronDown
              className={`h-4 w-4 ${
                isExpanded ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            />
          </div>
        </div>

        {/* Overview */}
        <p
          className={`text-xs leading-relaxed line-clamp-2 mb-3 ${
            isExpanded ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {project.overview}
        </p>

        {/* Meta badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
              isExpanded
                ? "bg-white/10 text-primary-foreground border-white/20"
                : difficultyStyles[project.difficulty]
            }`}
          >
            {project.difficulty.toUpperCase()}
          </Badge>
          <div
            className={`flex items-center gap-1 text-[10px] ${
              isExpanded ? "text-primary-foreground/60" : "text-muted-foreground"
            }`}
          >
            <Clock className="w-3 h-3" />
            {project.estimatedTime}
          </div>
        </div>
      </div>

      {/* Source handle — only when expanded */}
      {isExpanded && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-primary-foreground !border-2 !border-primary-foreground/30 !right-[-5px]"
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  2. ARCHITECTURE NODE
// ═══════════════════════════════════════════════════════════════════════════════

export function ArchitectureNode({ data }: any) {
  const arch = data.architecture as SystemProject["architecture"];

  return (
    <div
      onClick={() => data.onClick?.()}
      className="min-w-[260px] max-w-[300px] rounded-2xl bg-card border border-border/60 shadow-md transition-all hover:shadow-lg hover:border-brand/30 cursor-pointer group"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !left-[-4px]"
      />

      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Layers className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Architecture
              </div>
              <div className="font-semibold text-sm">{arch.pattern}</div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">
          {arch.description}
        </p>

        {/* Layers */}
        <div className="space-y-1.5">
          {arch.layers.map((layer: ArchitectureLayer, i: number) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/30"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
              <span className="text-[11px] font-medium truncate flex-1">
                {layer.name}
              </span>
              <span className="text-[9px] text-muted-foreground shrink-0">
                {layer.technologies.length} tools
              </span>
            </div>
          ))}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-border !right-[-4px]"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  3. FLOW PIPELINE NODE
// ═══════════════════════════════════════════════════════════════════════════════

export function FlowPipelineNode({ data }: any) {
  const steps: FlowStep[] = data.flowSteps;

  return (
    <div
      onClick={() => data.onClick?.()}
      className="min-w-[280px] max-w-[340px] rounded-2xl bg-card border border-border/60 shadow-md transition-all hover:shadow-lg hover:border-brand/30 cursor-pointer group"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !left-[-4px]"
      />

      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Workflow className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Project Flow
              </div>
              <div className="font-semibold text-sm">{steps.length} Steps</div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Vertical pipeline */}
        <div className="space-y-0">
          {steps.map((step, i) => {
            const Icon = resolveIcon(step.icon);
            return (
              <div key={step.id} className="flex items-start gap-2.5">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full bg-brand/10 flex items-center justify-center shrink-0 z-10 border border-brand/20">
                    <Icon className="h-3 w-3 text-brand" />
                  </div>
                  {i !== steps.length - 1 && (
                    <div className="w-px h-5 bg-border" />
                  )}
                </div>
                <div className="pb-1.5 min-w-0">
                  <div className="text-[11px] font-medium">{step.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[230px]">
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-border !right-[-4px]"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  4. TECH STACK NODE
// ═══════════════════════════════════════════════════════════════════════════════

export function TechStackNode({ data }: any) {
  const categories: TechCategory[] = data.techStack;

  return (
    <div
      onClick={() => data.onClick?.()}
      className="min-w-[260px] max-w-[310px] rounded-2xl bg-card border border-border/60 shadow-md transition-all hover:shadow-lg hover:border-brand/30 cursor-pointer group"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !left-[-4px]"
      />

      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Wrench className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Tech Stack
              </div>
              <div className="font-semibold text-sm">
                {categories.reduce((a, c) => a + c.items.length, 0)} Tools
              </div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="space-y-2.5">
          {categories.map((cat) => (
            <div key={cat.category}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                {cat.category}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.items.map((item) => {
                  const Icon = resolveIcon(item.icon);
                  return (
                    <div
                      key={item.name}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 border border-border/30 hover:bg-brand/5 hover:border-brand/20 transition-colors"
                    >
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium">
                        {item.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-border !right-[-4px]"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  5. COLLABORATION TOOLS NODE
// ═══════════════════════════════════════════════════════════════════════════════

export function CollabToolsNode({ data }: any) {
  const tools: CollabTool[] = data.collabTools;

  return (
    <div
      onClick={() => data.onClick?.()}
      className="min-w-[240px] max-w-[280px] rounded-2xl bg-card border border-border/60 shadow-md transition-all hover:shadow-lg hover:border-brand/30 cursor-pointer group"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !left-[-4px]"
      />

      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-pink-500/10 flex items-center justify-center">
              <Users className="h-3.5 w-3.5 text-pink-500" />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Collaboration
              </div>
              <div className="font-semibold text-sm">{tools.length} Tools</div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="space-y-1.5">
          {tools.map((tool) => {
            const Icon = resolveIcon(tool.icon);
            return (
              <div
                key={tool.name}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-muted/40 border border-border/30 hover:bg-brand/5 transition-colors"
              >
                <div className="h-6 w-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                  <Icon className="h-3 w-3 text-brand" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium">{tool.name}</div>
                  <div className="text-[9px] text-muted-foreground truncate">
                    {tool.purpose}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-border !right-[-4px]"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  6. PURPOSE NODE
// ═══════════════════════════════════════════════════════════════════════════════

export function PurposeNode({ data }: any) {
  return (
    <div
      onClick={() => data.onClick?.()}
      className="min-w-[260px] max-w-[300px] rounded-2xl bg-card border border-border/60 shadow-md transition-all hover:shadow-lg hover:border-brand/30 cursor-pointer group"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !left-[-4px]"
      />

      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Target className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Purpose & Business
              </div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Purpose */}
        <div className="mb-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-brand mb-1">
            Purpose
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/80 line-clamp-3">
            {data.purpose}
          </p>
        </div>

        {/* Business Purpose */}
        <div className="mb-3 p-2.5 rounded-lg bg-brand/5 border border-brand/10">
          <div className="text-[9px] font-bold uppercase tracking-widest text-brand mb-1">
            Business Goal
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/80 line-clamp-3">
            {data.businessPurpose}
          </p>
        </div>

        {/* Target Audience */}
        <div className="flex items-start gap-2">
          <Sparkles className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
            {data.targetAudience}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-border !right-[-4px]"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  7. DATA DOMAINS NODE
// ═══════════════════════════════════════════════════════════════════════════════

export function DataDomainsNode({ data }: any) {
  const domains: DataDomain[] = data.dataDomains;

  return (
    <div
      onClick={() => data.onClick?.()}
      className="min-w-[260px] max-w-[300px] rounded-2xl bg-card border border-border/60 shadow-md transition-all hover:shadow-lg hover:border-brand/30 cursor-pointer group"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !left-[-4px]"
      />

      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <HardDrive className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Data Domains
              </div>
              <div className="font-semibold text-sm">
                {domains.length} Domains
              </div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="space-y-2.5">
          {domains.map((domain) => (
            <div key={domain.domain}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium">{domain.domain}</span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 font-mono border-border/50"
                >
                  {domain.size}
                </Badge>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    background: domain.color,
                    width: `${Math.min(30 + Math.random() * 70, 100)}%`,
                    opacity: 0.7,
                  }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                {domain.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-border !right-[-4px]"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  8. DATABASE SCHEMA NODE (expandable tables + click for sheet)
// ═══════════════════════════════════════════════════════════════════════════════

export function DatabaseSchemaNode({ data }: any) {
  const schema = data.schema as { dbType: string; tables: DatabaseTable[] };
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  return (
    <div className="min-w-[270px] max-w-[320px] rounded-2xl bg-card border border-border/60 shadow-md transition-all hover:shadow-lg hover:border-brand/30 group">
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !left-[-4px]"
      />

      <div className="px-4 py-4">
        <div
          className="flex items-center justify-between mb-1 cursor-pointer"
          onClick={() => data.onClick?.()}
        >
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Database className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Database Schema
              </div>
              <div className="font-semibold text-sm">
                {schema.tables.length} Tables
              </div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="text-[9px] text-muted-foreground mb-3 px-1 flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
          {schema.dbType}
        </div>

        {/* Expandable tables */}
        <div className="space-y-1 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
          {schema.tables.map((table) => {
            const isExpanded = expandedTable === table.name;
            return (
              <div
                key={table.name}
                className="rounded-lg border border-border/40 overflow-hidden"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedTable(isExpanded ? null : table.name);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold font-mono">
                      {table.name}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      ({table.attributes.length} cols)
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-2.5 pb-2.5 pt-0.5 bg-muted/20 border-t border-border/30">
                    <div className="space-y-1">
                      {table.attributes.map((attr) => (
                        <div
                          key={attr.name}
                          className="flex items-center gap-2 text-[10px] px-1.5 py-1 rounded bg-background/50"
                        >
                          <span className="font-mono font-semibold text-foreground min-w-[80px]">
                            {attr.name}
                          </span>
                          <span className="text-brand font-mono text-[9px] min-w-[80px]">
                            {attr.type}
                          </span>
                          {attr.constraints && (
                            <span className="text-muted-foreground text-[8px] truncate">
                              {attr.constraints}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
