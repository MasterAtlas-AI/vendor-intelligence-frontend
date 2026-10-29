"use client";

import { useMutation } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import type { UploadRead } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/validation";

const ACCEPT = ".xlsx,.xlsm,.csv,.pdf";
const MAX_MB = 10; // backend UPLOAD_MAX_BYTES

/** Drop zone + file picker. Uploads straight away and hands back what the server found in the file. */
export function UploadStep({ onUploaded }: { onUploaded: (upload: UploadRead) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<UploadRead>("/imports/uploads", { method: "POST", body: form });
    },
    onSuccess: onUploaded,
  });

  function pick(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setLocalError(`The file is larger than ${MAX_MB} MB.`);
      return;
    }
    upload.mutate(file);
  }

  const error = localError ?? (upload.isError ? errorMessage(upload.error) : null);
  return (
    <Card>
      <CardContent>
        <button
          type="button"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:bg-muted/50",
          )}
        >
          <FileUp className="size-10 text-muted-foreground" />
          <div className="font-medium">
            {upload.isPending ? "Uploading and reading the file…" : "Drop a file here, or click to choose"}
          </div>
          <div className="max-w-md text-sm text-muted-foreground">
            <strong>Excel or CSV</strong>: a vendor list, one vendor per row. <strong>PDF</strong>: one vendor&apos;s
            brochure, datasheet, certificate or prequalification pack. Up to {MAX_MB} MB.
          </div>
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose a file to import"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
