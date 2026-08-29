import type { Express, RequestHandler } from "express";
import { isObjectStorageConfigured } from "./client";
import {
  ObjectNotFoundError,
  StorageNotConfiguredError,
  isUploadId,
  objectStorage,
} from "./service";

const MAX_UPLOAD_BYTES = Number.parseInt(process.env.MAX_UPLOAD_BYTES ?? "", 10) || 25 * 1024 * 1024;

/**
 * Content types an upload may declare.
 *
 * The uploaded object is later streamed back from our own origin by
 * GET /objects/uploads/:id. If a caller could choose an active content type
 * (text/html, image/svg+xml, application/javascript, ...) the object would
 * execute same-origin against the admin app — stored XSS with access to the
 * session cookie. Only inert media is accepted; anything else is rejected at
 * presign time, and the serve path re-checks (see service.ts) so objects
 * uploaded before this rule cannot bypass it either.
 *
 * Note SVG is deliberately excluded: it is an XML document that can carry
 * <script>.
 */
export const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
]);

/**
 * Presigned-URL upload flow (contract unchanged from the Replit era):
 *   1. POST /api/uploads/request-url  {name,size,contentType} -> {uploadURL, objectPath, metadata}
 *   2. client PUTs the file to uploadURL (same Content-Type it asked for)
 *   3. POST /api/uploads/complete     {objectPath} -> {url: objectPath}
 *   4. GET  /objects/uploads/:id       streams the object (public, immutable-cached)
 *
 * The two POST routes now require a signed-in user: only admin screens upload,
 * and an open presign endpoint would let anyone fill the bucket.
 */
export function registerObjectStorageRoutes(app: Express, opts: { requireAuth: RequestHandler }): void {
  const { requireAuth } = opts;

  const notConfigured: RequestHandler = (_req, res, next) => {
    if (!isObjectStorageConfigured()) {
      return res.status(503).json({ error: "Object storage is not configured" });
    }
    next();
  };

  app.post("/api/uploads/request-url", requireAuth, notConfigured, async (req, res) => {
    try {
      const { name, size, contentType } = req.body ?? {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      if (size !== undefined && (typeof size !== "number" || !Number.isFinite(size) || size < 0)) {
        return res.status(400).json({ error: "Invalid size" });
      }
      if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit` });
      }
      const ct = typeof contentType === "string" ? contentType.trim().toLowerCase().split(";")[0] : "";
      if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(ct)) {
        return res.status(415).json({
          error: `Unsupported file type${ct ? ` "${ct}"` : ""}. Allowed: ${Array.from(ALLOWED_UPLOAD_CONTENT_TYPES).join(", ")}`,
        });
      }
      const { uploadURL, objectPath } = await objectStorage.createUploadUrl({ contentType: ct });
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType: ct } });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      if (error instanceof StorageNotConfiguredError) return res.status(503).json({ error: error.message });
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.post("/api/uploads/complete", requireAuth, notConfigured, async (req, res) => {
    try {
      const { objectPath } = req.body ?? {};
      if (!objectPath || typeof objectPath !== "string") {
        return res.status(400).json({ error: "Missing required field: objectPath" });
      }
      const head = await objectStorage.headObject(objectPath);
      if (!head) return res.status(404).json({ error: "Object not found" });
      // The app serves uploads itself, so the canonical URL is the object path.
      res.json({ url: objectPath });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return res.status(404).json({ error: "Object not found" });
      console.error("Error completing upload:", error);
      res.status(500).json({ error: "Failed to complete upload" });
    }
  });

  app.get("/objects/uploads/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!isUploadId(id)) return res.status(404).json({ error: "Object not found" });
    if (!isObjectStorageConfigured()) return res.status(503).json({ error: "Object storage is not configured" });
    try {
      await objectStorage.streamObject(`/objects/uploads/${id}`, req, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return res.status(404).json({ error: "Object not found" });
      console.error("Error serving object:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
