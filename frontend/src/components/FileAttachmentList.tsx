"use client";

import { FileText, FileSpreadsheet, Presentation, Download, ExternalLink, Code } from "lucide-react";

export interface FileAttachment {
  url: string;
  name: string;
  size: number;
  mime_type: string;
}

const PDF_MIME = "application/pdf";

const CODE_EXTS = new Set([
  ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".h",
  ".cs", ".go", ".rs", ".rb", ".php", ".sh", ".sql", ".r", ".ipynb",
  ".json", ".yaml", ".yml", ".toml", ".xml",
]);

function fileIcon(mime: string, name: string) {
  if (mime === PDF_MIME) return <FileText className="w-4 h-4 text-red-500" />;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return <Presentation className="w-4 h-4 text-orange-500" />;
  if (mime === "text/plain") {
    const ext = name.includes(".") ? "." + name.split(".").pop()!.toLowerCase() : "";
    return CODE_EXTS.has(ext)
      ? <Code className="w-4 h-4 text-purple-500" />
      : <FileText className="w-4 h-4 text-muted-foreground" />;
  }
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
      {attachments.map((a, i) => {
        const isInline = a.mime_type === PDF_MIME || a.mime_type === "text/plain";
        return (
          <a
            key={i}
            href={a.url}
            {...(isInline
              ? { target: "_blank", rel: "noopener noreferrer" }
              : { download: a.name }
            )}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors no-underline group"
          >
            <span className="flex-shrink-0">{fileIcon(a.mime_type, a.name)}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-foreground truncate">{a.name}</span>
              <span className="text-xs text-muted-foreground">
                {fmtSize(a.size)}{isInline ? " · Opens in browser" : " · Click to download"}
              </span>
            </span>
            {isInline
              ? <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              : <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            }
          </a>
        );
      })}
    </div>
  );
}
