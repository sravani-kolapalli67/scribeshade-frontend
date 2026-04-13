import { ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";

type AIProjectData = {
  id: string;
  resume: string;
  position: string;
  jobDescription: string;
} & Record<string, any>;

const MOCK_PROJECTS: AIProjectData[] = [
  {
    id: "1",
    resume: "Frontend Developer Resume",
    position: "Senior Frontend Engineer",
    jobDescription:
      "Build interactive UI using React, Next.js, and Tailwind CSS. Focus on performance and accessibility.",
  },
  {
    id: "2",
    resume: "Fullstack Resume",
    position: "Software Engineer",
    jobDescription:
      "Develop full-stack web applications. Experience with Node.js, Express, and PostgreSQL required.",
  },
];

export function AIProjectsTable() {
  const getColumns = (): ColumnDef<AIProjectData, any>[] => [
    {
      accessorKey: "resume",
      header: "Resume",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium truncate max-w-[200px]">
            {row.original.resume}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "position",
      header: "Position",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className="px-2.5 py-1 rounded-md font-medium text-xs bg-secondary/50 hover:bg-secondary/80 transition-colors border-none"
        >
          {row.original.position}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right w-full pr-12">Projects</div>,
      cell: ({ row }) => (
        <div className="flex justify-end pr-2">
          <Link to={`/ai-projects/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-24 rounded-lg hover:bg-primary hover:text-primary-foreground hover:shadow-md transition-all"
            >
              3 Projects <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ),
      enableSorting: false,
    },
  ];

  const fetchDataFn = async (params: any) => {
    // Return mock data with a slight delay to simulate network
    return new Promise<{
      success: boolean;
      data: AIProjectData[];
      pagination: {
        page: number;
        limit: number;
        total_pages: number;
        total_items: number;
      };
    }>((resolve) => {
      setTimeout(() => {
        const page = params?.page || 1;
        const limit = params?.limit || 10;
        const total_items = MOCK_PROJECTS.length;
        const total_pages = Math.ceil(total_items / limit);
        const startIndex = (page - 1) * limit;
        const paginatedData = MOCK_PROJECTS.slice(
          startIndex,
          startIndex + limit,
        );

        resolve({
          success: true,
          data: paginatedData,
          pagination: {
            page: page,
            limit: limit,
            total_pages: total_pages,
            total_items: total_items,
          },
        });
      }, 500);
    });
  };

  return (
    <div>
      <DataTable
        getColumns={getColumns}
        fetchDataFn={fetchDataFn}
        idField="id"
        config={{
          enableUrlState: false, // Internal usage
          enableColumnResizing: true,
        }}
      />
    </div>
  );
}
