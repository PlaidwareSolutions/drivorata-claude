import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Mark an uploaded object as publicly readable and return its public URL.
   *
   * Request body (JSON):
   * {
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * Response:
   * {
   *   "url": "https://storage.googleapis.com/..."
   * }
   */
  app.post("/api/uploads/complete", async (req, res) => {
    try {
      const { objectPath } = req.body;

      if (!objectPath || typeof objectPath !== "string") {
        return res.status(400).json({ error: "Missing required field: objectPath" });
      }

      // Verify the object exists, then return the internal proxy URL.
      // We serve uploads through GET /objects/uploads/:id so no signed URL
      // or ACL change is needed — avoids GCS uniform-bucket-access restrictions.
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const [exists] = await objectFile.exists();
      if (!exists) {
        return res.status(404).json({ error: "Object not found" });
      }

      // objectPath is already "/objects/uploads/<uuid>" which our proxy serves
      res.json({ url: objectPath });
    } catch (error) {
      console.error("Error completing upload:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to complete upload" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/uploads/:id", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(`/objects/uploads/${req.params.id}`);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

