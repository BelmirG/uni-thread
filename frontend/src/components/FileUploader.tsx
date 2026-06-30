"use client";

import { useRef, useState } from "react";
import { Paperclip, X, Loader2, FileText, FileSpreadsheet, Presentation } from "lucide-react";

export interface FileAttachment {
  url: string;
  name: string;
  size: number;
  mime_type: string;
}

interface UploadEntry {
  attachment: FileAttachment | null;
  uploading: boolean;
  error: string | null;
  localName: string;
}

interface Props {
  onChange: (attachments: FileAttachment[], uploading: boolean) => void;
  maxFiles?: number;
}

const ACCEPT = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

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

export function FileUploader({ onChange, maxFiles = 5 }: Props) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function notify(updated: UploadEntry[]) {
    const done = updated.filter((e) => e.attachment !== null).map((e) => e.attachment!);
    const uploading = updated.some((e) => e.uploading);
    onChangeRef.current(done, uploading);
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, maxFiles - entries.length);
    if (!files.length) return;
    if (inputRef.current) inputRef.current.value = "";

    const startIdx = entries.length;
    const newEntries: UploadEntry[] = files.map((f) => ({
      attachment: null,
      uploading: true,
      error: null,
      localName: f.name,
    }));
    const next = [...entries, ...newEntries];
    setEntries(next);
    notify(next);

    await Promise.all(
      files.map(async (file, i) => {
        const idx = startIdx + i;
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch("/api/upload/file", {
            method: "POST",
            credentials: "include",
            body: fd,
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { detail?: string };
            throw new Error(body.detail ?? "Upload failed");
          }
          const attachment = (await res.json()) as FileAttachment;
          setEntries((prev) => {
            const updated = [...prev];
            if (updated[idx]) updated[idx] = { ...updated[idx], attachment, uploading: false };
            notify(updated);
            return updated;
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setEntries((prev) => {
            const updated = [...prev];
            if (updated[idx]) updated[idx] = { ...updated[idx], uploading: false, error: msg };
            notify(updated);
            return updated;
          });
        }
      })
    );
  }

  function remove(i: number) {
    setEntries((prev) => {
      const updated = prev.filter((_, j) => j !== i);
      notify(updated);
      return updated;
    });
  }

  const canAdd = entries.length < maxFiles;

  return (
    <div>
      {canAdd && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={handleChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground border border-input rounded-md px-3 py-1.5 bg-background hover:bg-muted transition-colors"
          >
            <Paperclip className="w-3.5 h-3.5" />
            Attach file
          </button>
        </>
      )}

      {entries.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 text-xs"
            >
              {entry.uploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
              ) : entry.error ? (
                <FileText className="w-4 h-4 text-destructive flex-shrink-0" />
              ) : (
                <span className="flex-shrink-0">
                  {fileIcon(entry.attachment!.mime_type)}
                </span>
              )}
              <span className="flex-1 min-w-0 truncate text-foreground">
                {entry.localName}
              </span>
              {entry.uploading && (
                <span className="text-muted-foreground flex-shrink-0">uploading…</span>
              )}
              {entry.error && !entry.uploading && (
                <span className="text-destructive flex-shrink-0">{entry.error}</span>
              )}
              {entry.attachment && !entry.uploading && (
                <span className="text-muted-foreground flex-shrink-0">
                  {fmtSize(entry.attachment.size)}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
