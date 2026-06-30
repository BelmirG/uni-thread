"use client";

import { FileText, FileSpreadsheet, Presentation, Download } from "lucide-react";

export interface FileAttachment {
  url: string;
  name: string;
  size: number;
  mime_type: string;
}

function fileIcon(mime: string) {
  if (mime === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return <Presentation className="w-4 h-4 text-orange-500" />;
  return <FileText className="w-4 h-4 text-blue-500" />;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachmentList({ attachments }: { attachments: FileAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="space-y-1.5">
      {attachments.map((a, i) => (
        <a
          key={i}
          href={a.url}
          download={a.name}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors no-underline group"
        >
          <span className="flex-shrink-0">{fileIcon(a.mime_type)}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-foreground truncate">{a.name}</span>
            <span className="text-xs text-muted-foreground">{fmtSize(a.size)}</span>
          </span>
          <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
        </a>
      ))}
    </div>
  );
}
