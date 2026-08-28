import { useState, useRef } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import DashboardModal from "@uppy/react/dashboard-modal";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import AwsS3 from "@uppy/aws-s3";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  /**
   * Called once the file has been uploaded AND made publicly readable.
   * Receives the canonical public URL of the uploaded object.
   */
  onUploaded: (url: string) => void;
  onError?: (error: Error) => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * Button + modal file uploader.
 *
 * Owns the full presigned-URL flow end-to-end so callers only deal with the
 * final public URL:
 *   1. Request a presigned PUT URL from /api/uploads/request-url
 *   2. Have Uppy AwsS3 PUT the file to that URL
 *   3. Call /api/uploads/complete to make the object publicly readable
 *   4. Invoke onUploaded(publicUrl)
 *
 * Failures at any step surface a toast and call onError if provided.
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onUploaded,
  onError,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const { toast } = useToast();
  // Map<file.id, objectPath> — populated when we mint the presigned URL and
  // consumed in onComplete. Avoids relying on Uppy's mutable `meta` which
  // does not always survive the round-trip in v5.
  const objectPathsRef = useRef<Map<string, string>>(new Map());
  const onUploadedRef = useRef(onUploaded);
  const onErrorRef = useRef(onError);
  onUploadedRef.current = onUploaded;
  onErrorRef.current = onError;

  const [uppy] = useState(() => {
    const instance = new Uppy({
      restrictions: { maxNumberOfFiles, maxFileSize },
      autoProceed: false,
    }).use(AwsS3, {
      shouldUseMultipart: false,
      getUploadParameters: async (file) => {
        const res = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to get upload URL");
        }
        const data = (await res.json()) as { uploadURL: string; objectPath: string };
        objectPathsRef.current.set(file.id, data.objectPath);
        return {
          method: "PUT" as const,
          url: data.uploadURL,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        };
      },
    });

    instance.on("complete", async (result) => {
      try {
        const failed = result.failed ?? [];
        if (failed.length > 0) {
          const first = failed[0];
          const msg =
            (first?.error && (typeof first.error === "string" ? first.error : (first.error as Error).message)) ||
            "Upload failed";
          toast({ title: "Upload failed", description: msg, variant: "destructive" });
          onErrorRef.current?.(new Error(msg));
        }
        for (const f of result.successful ?? []) {
          const objectPath = objectPathsRef.current.get(f.id);
          objectPathsRef.current.delete(f.id);
          if (!objectPath) continue;
          const completeRes = await fetch("/api/uploads/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ objectPath }),
          });
          if (!completeRes.ok) {
            const data = await completeRes.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error || "Failed to publish uploaded file");
          }
          const data = (await completeRes.json()) as { url?: string };
          if (data.url) {
            onUploadedRef.current(data.url);
            setShowModal(false);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Upload failed");
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        onErrorRef.current?.(error);
      }
    });

    return instance;
  });

  return (
    <div>
      <Button type="button" onClick={() => setShowModal(true)} className={buttonClassName}>
        {children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
      />
    </div>
  );
}
