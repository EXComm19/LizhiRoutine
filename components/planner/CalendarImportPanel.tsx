"use client";

import { useRef, useState } from "react";
import { Link, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export function CalendarImportPanel({
  importCalendarText,
  message,
  setMessage,
  className,
}: {
  importCalendarText: (text: string) => void;
  message: string;
  setMessage: (message: string) => void;
  className?: string;
}) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;

    setMode("file");
    setIsLoading(true);
    setMessage(`Importing ${file.name || "calendar"}...`);

    try {
      const text = await file.text();
      if (!text.includes("BEGIN:VCALENDAR") && !text.includes("BEGIN:VEVENT")) {
        setMessage("That file does not look like an .ics calendar.");
        return;
      }
      importCalendarText(text);
    } catch {
      setMessage("Could not read that calendar file.");
    } finally {
      setIsLoading(false);
      setIsDragActive(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    setIsLoading(true);
    setMessage("Importing calendar link...");

    try {
      const response = await fetch("/api/import-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const payload = (await response.json()) as {
        text?: string;
        error?: string;
      };

      if (!response.ok || !payload.text) {
        setMessage(payload.error ?? "Could not fetch that calendar link.");
        return;
      }

      importCalendarText(payload.text);
      setUrl("");
    } catch {
      setMessage(
        "Could not fetch that link. Try downloading the .ics file and importing it.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "mx-3.5 mb-1 rounded-[var(--r)] border border-[color:var(--line-soft)] bg-[color:var(--sunken)] p-3 transition-colors",
        isDragActive && "border-[color:var(--line-strong)] bg-[color:var(--hover)]",
        className,
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => {
        setIsDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragActive(false);
        void handleFile(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept=".ics,text/calendar"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <div className="grid grid-cols-2 gap-0.5 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] p-0.5">
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors",
            mode === "file"
              ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
              : "text-[color:var(--ink-2)] hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)]",
          )}
          onClick={() => {
            setMode("file");
            setMessage("");
          }}
        >
          <Upload className="h-3 w-3" />
          File
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors",
            mode === "url"
              ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
              : "text-[color:var(--ink-2)] hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)]",
          )}
          onClick={() => {
            setMode("url");
            setMessage("");
          }}
        >
          <Link className="h-3 w-3" />
          URL
        </button>
      </div>
      {mode === "file" ? (
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-center rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-2 font-[family-name:var(--font-mono)] text-[11.5px] text-[color:var(--ink-3)] transition-colors hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink-2)]"
          onClick={() => fileInputRef.current?.click()}
        >
          {isDragActive ? "Drop to import .ics file" : "Drop .ics file or click to choose"}
        </button>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            className="min-w-0 flex-1 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-2 font-[family-name:var(--font-mono)] text-[11.5px] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
            placeholder="Paste .ics or webcal URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleUrlImport();
              }
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded-[var(--r-sm)] bg-[color:var(--ink)] px-2.5 py-2 text-[11.5px] font-semibold !text-[color:var(--card)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isLoading || !url.trim()}
            onClick={() => void handleUrlImport()}
          >
            {isLoading ? "..." : "Import"}
          </button>
        </div>
      )}
      {message && (
        <div className="mt-2 rounded-md bg-[color:var(--card)] px-2.5 py-1.5 text-[11px] text-[color:var(--ink-2)]">
          {message}
        </div>
      )}
    </div>
  );
}
