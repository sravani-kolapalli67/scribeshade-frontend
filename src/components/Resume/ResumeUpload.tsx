// import React, { useRef, useState } from "react";
// import { open } from "@tauri-apps/plugin-dialog";
// import { copyFile, BaseDirectory } from "@tauri-apps/plugin-fs";

// export default function ResumeUpload() {
//   const [status, setStatus] = useState("");
//   const [savedPath, setSavedPath] = useState("");

//   const handleUpload = async () => {
//     try {
//       // 1️⃣ Open native file picker — PDF/DOC only
//       const selectedPath = await open({
//         multiple: false,
//         filters: [{ name: "Resume", extensions: ["pdf", "doc", "docx"] }],
//       });

//       if (!selectedPath) return; // user cancelled

//       // 2️⃣ Define destination inside app's local data directory
//       const fileName = `resume_${Date.now()}.pdf`;
//       const destPath = `resumes/${fileName}`;

//       // 3️⃣ Copy file to app data directory (safe, sandboxed)
//       await copyFile(selectedPath, destPath, {
//         toPathBaseDir: BaseDirectory.AppLocalData,
//       });

//       // 4️⃣ Build the full stored path string
//       const fullStoredPath = `AppLocalData/resumes/${fileName}`;

//       // 5️⃣ Send path to your backend → Prisma → PostgreSQL
//       const response = await fetch(`http://localhost:3000/api/resume/upload`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ resumePath: fullStoredPath }),
//       });

//       const data = await response.json();

//       if (data.success) {
//         setSavedPath(fullStoredPath);
//         setStatus("✅ Resume uploaded and saved!");
//       }
//     } catch (err) {
//       console.error(err);
//       setStatus("❌ Upload failed. Check console.");
//     }
//   };

//   return (
//     <div>
//       <h2>Upload Resume</h2>
//       <button onClick={handleUpload}>📄 Choose Resume File</button>
//       {status && <p>{status}</p>}
//       {savedPath && (
//         <p>
//           Stored at: <code>{savedPath}</code>
//         </p>
//       )}
//     </div>
//   );
//   //   const inputRef = useRef(null);
//   //   const [isDragging, setIsDragging] = useState(false);
//   //   const handleClick = () => {
//   //     inputRef.current?.click();
//   //   };
//   //   const handleFiles = (files) => {
//   //     console.log(files);
//   //     // handle upload logic here
//   //   };
//   //   const handleDrop = (e) => {
//   //     e.preventDefault();
//   //     setIsDragging(false);
//   //     handleFiles(e.dataTransfer.files);
//   //   };
//   //   return (
//   //     <div
//   //       onClick={handleClick}
//   //       onDragOver={(e) => {
//   //         e.preventDefault();
//   //         setIsDragging(true);
//   //       }}
//   //       onDragLeave={() => setIsDragging(false)}
//   //       onDrop={handleDrop}
//   //       style={{
//   //         border: "2px dashed #d1d5db",
//   //         borderRadius: "10px",
//   //         padding: "40px",
//   //         textAlign: "center",
//   //         cursor: "pointer",
//   //         backgroundColor: isDragging ? "#f3f4f6" : "#fafafa",
//   //         transition: "0.2s ease",
//   //       }}
//   //     >
//   //       <input
//   //         ref={inputRef}
//   //         type="file"
//   //         multiple
//   //         onChange={(e) => handleFiles(e.target.files)}
//   //         style={{ display: "none" }}
//   //       />
//   //       <div style={{ fontSize: "16px", color: "#374151" }}>
//   //         <strong>Drop files here</strong> or{" "}
//   //         <span style={{ textDecoration: "underline" }}>click to upload</span>
//   //       </div>
//   //       <div style={{ marginTop: "8px", fontSize: "12px", color: "#9ca3af" }}>
//   //         PDF, DOCX • Max 10 MB
//   //       </div>
//   //     </div>
//   //   );
// }

import { useState, useRef } from "react";
import { UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const isTauri = () => typeof window !== "undefined" && "__TAURI__" in window;
const API = "http://localhost:3000";

export default function ResumeUpload({ userId }: { userId: string }) {
  const [status, setStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Shared: send file to backend ──────────────────────────
  const uploadToServer = async (file: File) => {
    const formData = new FormData();
    formData.append("resume", file);
    formData.append("userId", userId);

    try {
      const res = await fetch(`${API}/api/resume/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      console.log(data);
      setStatus(data.id ? "✅ Resume uploaded!" : "❌ Upload failed");
    } catch (error) {
      console.error("Upload error:", error);
      setStatus("❌ Upload failed");
    }
  };

  // ── Desktop: Tauri file picker ─────────────────────────────
  const handleTauriUpload = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");

    const selected = await open({
      multiple: false,
      filters: [{ name: "Resume", extensions: ["pdf", "doc", "docx"] }],
    });
    if (!selected) return;

    // Read file as bytes and convert to Blob
    const contents = await readFile(selected);
    const blob = new Blob([contents], { type: "application/pdf" });
    const file = new File([blob], selected.split(/[\\/]/).pop()!, {
      type: "application/pdf",
    });

    await uploadToServer(file);
  };

  // ── Web: Browser file input ────────────────────────────────
  const handleWebUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadToServer(file);
  };

  const handleClick = () => {
    if (isTauri()) {
      handleTauriUpload();
    } else {
      fileInputRef.current?.click(); // trigger hidden input
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await uploadToServer(file);
    }
  };

  return (
    <div className="w-full">
      {/* Hidden input for web */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={handleWebUpload}
      />

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 transition-all duration-200 ease-in-out hover:bg-muted/50",
          isDragging && "border-primary bg-muted ring-4 ring-primary/5"
        )}
      >
        <div className="mb-4 flex items-center justify-center">
          <UploadIcon className="h-10 w-10 text-gray-400" />
        </div>
        
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            Drop files here or <span className="underline underline-offset-4">click to upload</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PDF, DOCX &bull; Max 10 MB
          </p>
        </div>

        {status && (
          <div className={cn(
            "mt-4 rounded-full px-4 py-1 text-xs font-medium",
            status.includes("✅") ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"
          )}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
