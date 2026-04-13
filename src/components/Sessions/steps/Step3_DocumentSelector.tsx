import { useState, useRef } from "react";
import { UploadIcon, FileIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Step3Props {
  documents: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

export function Step3_DocumentSelector({ documents, onAdd, onRemove }: Step3Props) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onAdd(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      onAdd(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <UploadIcon className="h-4 w-4 text-primary" />
          Extra Documents
        </h2>
        <p className="text-xs text-muted-foreground">
          Upload any search notes, research, or extra context docs.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group",
          isDragging 
            ? "border-primary bg-primary/5 scale-[0.99]" 
            : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.txt"
        />
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
          <UploadIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-bold">Click or drag documents here</p>
          <p className="text-[11px] text-muted-foreground">PDF, DOCX, TXT (Max 10MB)</p>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
          {documents.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2.5 border rounded-xl bg-muted/30 group animate-in slide-in-from-left-2 duration-300"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="shrink-0 h-8 w-8 rounded-lg bg-white border flex items-center justify-center shadow-sm">
                  <FileIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-[13px] font-bold truncate text-foreground">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
