import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  Workflow,
  Wrench,
  Users,
  Target,
  HardDrive,
  Database,
} from "lucide-react";
import type {
  SystemProject,
  ArchitectureLayer,
  FlowStep,
  TechCategory,
  CollabTool,
  DataDomain,
  DatabaseTable,
} from "./data";

// ─── Types ───────────────────────────────────────────────────────────────────

type DetailType =
  | { type: "architecture"; data: SystemProject["architecture"] }
  | { type: "flow"; data: FlowStep[] }
  | { type: "techStack"; data: TechCategory[] }
  | { type: "collab"; data: CollabTool[] }
  | {
      type: "purpose";
      data: {
        purpose: string;
        businessPurpose: string;
        targetAudience: string;
      };
    }
  | { type: "dataDomains"; data: DataDomain[] }
  | { type: "database"; data: { dbType: string; tables: DatabaseTable[] } };

interface NodeDetailSheetProps {
  detail: DetailType | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Detail Sheet Component ──────────────────────────────────────────────────

export function NodeDetailSheet({
  detail,
  isOpen,
  onOpenChange,
}: NodeDetailSheetProps) {
  if (!detail) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col h-full border-l border-border/50 overflow-x-hidden">
        <SheetHeader className="p-6 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center">
              {getIcon(detail.type)}
            </div>
            <SheetTitle className="text-xl font-bold tracking-tight">
              {getTitle(detail.type)}
            </SheetTitle>
          </div>
          <SheetDescription className="text-sm">
            {getDescription(detail.type)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 no-scrollbar">
          <div className="py-6">
            {detail.type === "architecture" && (
              <ArchitectureDetail data={detail.data} />
            )}
            {detail.type === "flow" && <FlowDetail data={detail.data} />}
            {detail.type === "techStack" && (
              <TechStackDetail data={detail.data} />
            )}
            {detail.type === "collab" && <CollabDetail data={detail.data} />}
            {detail.type === "purpose" && <PurposeDetail data={detail.data} />}
            {detail.type === "dataDomains" && (
              <DataDomainsDetail data={detail.data} />
            )}
            {detail.type === "database" && (
              <DatabaseDetail data={detail.data} />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Detail Renderers ────────────────────────────────────────────────────────

function ArchitectureDetail({ data }: { data: SystemProject["architecture"] }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold mb-2">
          Pattern: {data.pattern}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {data.description}
        </p>
      </div>
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Layers
        </h4>
        {data.layers.map((layer: ArchitectureLayer, i: number) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-2"
          >
            <div className="font-semibold text-sm">{layer.name}</div>
            <p className="text-xs text-muted-foreground">{layer.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {layer.technologies.map((tech) => (
                <Badge key={tech} variant="secondary" className="text-[10px]">
                  {tech}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowDetail({ data }: { data: FlowStep[] }) {
  return (
    <div className="space-y-4">
      {data.map((step, i) => (
        <div key={step.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold shrink-0">
              {i + 1}
            </div>
            {i !== data.length - 1 && (
              <div className="w-px flex-1 bg-border my-1" />
            )}
          </div>
          <div className="pb-3">
            <div className="font-medium text-sm mb-1">{step.title}</div>
            <p className="text-xs text-muted-foreground">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TechStackDetail({ data }: { data: TechCategory[] }) {
  return (
    <div className="space-y-5">
      {data.map((cat) => (
        <div key={cat.category}>
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {cat.category}
          </h4>
          <div className="space-y-2">
            {cat.items.map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40"
              >
                <span className="font-medium text-sm">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  — {item.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CollabDetail({ data }: { data: CollabTool[] }) {
  return (
    <div className="space-y-2.5">
      {data.map((tool) => (
        <div
          key={tool.name}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40"
        >
          <span className="font-medium text-sm">{tool.name}</span>
          <span className="text-xs text-muted-foreground">
            — {tool.purpose}
          </span>
        </div>
      ))}
    </div>
  );
}

function PurposeDetail({
  data,
}: {
  data: { purpose: string; businessPurpose: string; targetAudience: string };
}) {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-brand mb-2">
          Purpose
        </h4>
        <p className="text-sm leading-relaxed">{data.purpose}</p>
      </div>
      <div className="p-4 rounded-xl bg-brand/5 border border-brand/10">
        <h4 className="text-xs font-bold uppercase tracking-widest text-brand mb-2">
          Business Goal
        </h4>
        <p className="text-sm leading-relaxed">{data.businessPurpose}</p>
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Target Audience
        </h4>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {data.targetAudience}
        </p>
      </div>
    </div>
  );
}

function DataDomainsDetail({ data }: { data: DataDomain[] }) {
  return (
    <div className="space-y-4">
      {data.map((domain) => (
        <div
          key={domain.domain}
          className="p-4 rounded-xl border border-border/40"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">{domain.domain}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {domain.size}
            </Badge>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
            <div
              className="h-full rounded-full"
              style={{ background: domain.color, width: "75%", opacity: 0.7 }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{domain.description}</p>
        </div>
      ))}
    </div>
  );
}

function DatabaseDetail({
  data,
}: {
  data: { dbType: string; tables: DatabaseTable[] };
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Database className="h-4 w-4" />
        {data.dbType}
      </div>
      {data.tables.map((table) => (
        <div
          key={table.name}
          className="rounded-xl border border-border/40 overflow-hidden"
        >
          <div className="px-4 py-2.5 bg-muted/30 border-b border-border/30 font-semibold text-sm font-mono">
            {table.name}
          </div>
          <div className="p-3 space-y-1.5">
            {table.attributes.map((attr) => (
              <div
                key={attr.name}
                className="flex items-center gap-3 text-xs px-2 py-1.5 rounded bg-muted/20"
              >
                <span className="font-mono font-semibold min-w-[90px]">
                  {attr.name}
                </span>
                <span className="text-brand font-mono min-w-[100px]">
                  {attr.type}
                </span>
                {attr.constraints && (
                  <span className="text-muted-foreground text-[10px]">
                    {attr.constraints}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIcon(type: DetailType["type"]) {
  const map = {
    architecture: <Layers className="h-4 w-4 text-brand" />,
    flow: <Workflow className="h-4 w-4 text-brand" />,
    techStack: <Wrench className="h-4 w-4 text-brand" />,
    collab: <Users className="h-4 w-4 text-brand" />,
    purpose: <Target className="h-4 w-4 text-brand" />,
    dataDomains: <HardDrive className="h-4 w-4 text-brand" />,
    database: <Database className="h-4 w-4 text-brand" />,
  };
  return map[type];
}

function getTitle(type: DetailType["type"]) {
  const map = {
    architecture: "Architecture",
    flow: "Project Flow",
    techStack: "Tech Stack",
    collab: "Collaboration Tools",
    purpose: "Purpose & Business",
    dataDomains: "Data Domains",
    database: "Database Schema",
  };
  return map[type];
}

function getDescription(type: DetailType["type"]) {
  const map = {
    architecture: "System architecture pattern and layer breakdown",
    flow: "Step-by-step project execution pipeline",
    techStack: "Technologies and tools used across the stack",
    collab: "Tools used for team collaboration and productivity",
    purpose: "Project purpose, business goals, and target audience",
    dataDomains: "Data volumes and domains handled by the system",
    database: "Database tables, attributes, and constraints",
  };
  return map[type];
}

// ─── Legacy re-export for backward compat ────────────────────────────────────
export { NodeDetailSheet as StepDetailSheet };
