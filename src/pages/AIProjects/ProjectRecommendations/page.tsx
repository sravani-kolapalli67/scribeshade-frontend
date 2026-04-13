import { ProjectCanvas } from "@/components/AI projects/ProjectCanvas";

export default function ProjectRecommendations() {
  return (
    <div className="flex-1 flex flex-col ">
      {/* <div className="shrink-0 flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/ai-projects">AI Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Project Roadmap Canvas</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="flex items-center gap-2">
           <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
           <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Interactive Mode</span>
        </div>
      </div> */}

      <div className="flex-1 min-h-0">
        <ProjectCanvas />
      </div>
    </div>
  );
}
