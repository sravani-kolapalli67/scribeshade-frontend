import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Panel,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { systemProjects, type SystemProject } from "./data";
import {
  ProjectHeaderNode,
  ArchitectureNode,
  FlowPipelineNode,
  TechStackNode,
  CollabToolsNode,
  PurposeNode,
  DataDomainsNode,
  DatabaseSchemaNode,
} from "./ProjectTreeNodes";
import { NodeDetailSheet } from "./StepDetailSheet";
import { MousePointer2, Maximize } from "lucide-react";

// ─── Node type registry ─────────────────────────────────────────────────────

const nodeTypes = {
  projectHeader: ProjectHeaderNode,
  architecture: ArchitectureNode,
  flowPipeline: FlowPipelineNode,
  techStack: TechStackNode,
  collabTools: CollabToolsNode,
  purpose: PurposeNode,
  dataDomains: DataDomainsNode,
  databaseSchema: DatabaseSchemaNode,
};

// ─── Layout constants ────────────────────────────────────────────────────────

const COL_SPACING = 380;
const COLLAPSED_HEIGHT = 140;
const EXPANDED_HEIGHT_ESTIMATE = 950;
const PROJECT_GAP = 60;

// ─── Canvas Component ────────────────────────────────────────────────────────

export function ProjectCanvas() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sheetDetail, setSheetDetail] = useState<any>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  const toggleProject = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openSheet = useCallback((detail: any) => {
    setSheetDetail(detail);
    setIsSheetOpen(true);
  }, []);

  // ─── Build full canvas layout ───────────────────────────────────────────

  const buildLayout = useCallback(() => {
    const allNodes: any[] = [];
    const allEdges: any[] = [];
    let currentY = 0;

    systemProjects.forEach((project) => {
      const isExpanded = expandedIds.has(project.id);
      const headerId = `${project.id}-header`;

      // ── Project Header Node (always visible) ────────────────────────────
      allNodes.push({
        id: headerId,
        type: "projectHeader",
        data: {
          project,
          isExpanded,
          onToggle: toggleProject,
        },
        position: { x: 0, y: currentY },
      });

      if (isExpanded) {
        // ── Column 1: Architecture + Flow ─────────────────────────────────
        const archId = `${project.id}-arch`;
        const flowId = `${project.id}-flow`;

        allNodes.push({
          id: archId,
          type: "architecture",
          data: {
            architecture: project.architecture,
            onClick: () =>
              openSheet({ type: "architecture", data: project.architecture }),
          },
          position: { x: COL_SPACING, y: currentY },
        });

        allNodes.push({
          id: flowId,
          type: "flowPipeline",
          data: {
            flowSteps: project.projectFlow,
            onClick: () =>
              openSheet({ type: "flow", data: project.projectFlow }),
          },
          position: { x: COL_SPACING, y: currentY + 320 },
        });

        allEdges.push(
          makeEdge(headerId, archId, "#458fff", true),
          makeEdge(headerId, flowId, "#458fff", true)
        );

        // ── Column 2: TechStack + CollabTools + Purpose ───────────────────
        const techId = `${project.id}-tech`;
        const collabId = `${project.id}-collab`;
        const purposeId = `${project.id}-purpose`;

        allNodes.push({
          id: techId,
          type: "techStack",
          data: {
            techStack: project.techStack,
            onClick: () =>
              openSheet({ type: "techStack", data: project.techStack }),
          },
          position: { x: COL_SPACING * 2, y: currentY },
        });

        allNodes.push({
          id: collabId,
          type: "collabTools",
          data: {
            collabTools: project.collaborationTools,
            onClick: () =>
              openSheet({ type: "collab", data: project.collaborationTools }),
          },
          position: { x: COL_SPACING * 2, y: currentY + 370 },
        });

        allNodes.push({
          id: purposeId,
          type: "purpose",
          data: {
            purpose: project.purpose,
            businessPurpose: project.businessPurpose,
            targetAudience: project.targetAudience,
            onClick: () =>
              openSheet({
                type: "purpose",
                data: {
                  purpose: project.purpose,
                  businessPurpose: project.businessPurpose,
                  targetAudience: project.targetAudience,
                },
              }),
          },
          position: { x: COL_SPACING * 2, y: currentY + 640 },
        });

        allEdges.push(
          makeEdge(archId, techId, "#94a3b8", false),
          makeEdge(flowId, collabId, "#94a3b8", false),
          makeEdge(flowId, purposeId, "#94a3b8", false)
        );

        // ── Column 3: Data Domains ────────────────────────────────────────
        const dataId = `${project.id}-data`;

        allNodes.push({
          id: dataId,
          type: "dataDomains",
          data: {
            dataDomains: project.dataDomains,
            onClick: () =>
              openSheet({ type: "dataDomains", data: project.dataDomains }),
          },
          position: { x: COL_SPACING * 3, y: currentY + 80 },
        });

        allEdges.push(
          makeEdge(techId, dataId, "#94a3b8", false),
          makeEdge(purposeId, dataId, "#94a3b8", false)
        );

        // ── Column 4: Database Schema ─────────────────────────────────────
        const dbId = `${project.id}-db`;

        allNodes.push({
          id: dbId,
          type: "databaseSchema",
          data: {
            schema: project.database,
            onClick: () =>
              openSheet({ type: "database", data: project.database }),
          },
          position: { x: COL_SPACING * 4, y: currentY + 40 },
        });

        allEdges.push(makeEdge(dataId, dbId, "#f59e0b", true));

        currentY += EXPANDED_HEIGHT_ESTIMATE + PROJECT_GAP;
      } else {
        currentY += COLLAPSED_HEIGHT + PROJECT_GAP;
      }
    });

    setNodes(allNodes);
    setEdges(allEdges);
  }, [expandedIds, toggleProject, openSheet, setNodes, setEdges]);

  // Sync layout whenever expandedIds change
  useMemo(() => {
    buildLayout();
  }, [buildLayout]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-screen border-none bg-muted/10 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.15}
        maxZoom={1.5}
        className="[&_.react-flow__pane]:cursor-crosshair"
      >
        <Background gap={24} color="hsl(var(--primary) / 0.04)" />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !shadow-lg !rounded-xl overflow-hidden"
        />

        {/* Top-left: Title */}
        <Panel position="top-left" className="p-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              AI System Design
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click a project to expand • Click any section to view details
            </p>
          </div>
        </Panel>

        {/* Bottom-right: interaction hints */}
        <Panel position="bottom-right" className="p-4">
          <div className="flex flex-col gap-2 p-3 bg-card/80 backdrop-blur-md rounded-2xl border border-border/50 shadow-xl">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
              <MousePointer2 className="w-3 h-3" />
              Scroll to zoom / Drag to pan
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
              <Maximize className="w-3 h-3" />
              Click sections to view full details
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Detail Sheet */}
      <NodeDetailSheet
        detail={sheetDetail}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
      />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEdge(
  source: string,
  target: string,
  color: string,
  animated: boolean
) {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    type: "smoothstep",
    animated,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color,
      width: 7,
      height: 7,
    },
    style: { stroke: color, strokeWidth: 1.5 },
  };
}
