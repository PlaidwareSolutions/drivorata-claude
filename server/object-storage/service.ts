import { randomUUID } from "crypto";
import type { Readable } from "stream";
import type { Request, Response } from "express";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2 } from "./client";

/**
 * Object storage service backed by Cloudflare R2.
 *
 * Public contract (unchanged from the previous implementation):
 *   - uploads are addressed by an *object path* of the form
 *     `/objects/uploads/<uuid>`; that string is what gets persisted in the DB
 *     (media.object_path, packages.image_url, ...).
 *   - the browser PUTs the file straight to a presigned URL, then the app
 *     serves it back through `GET /objects/uploads/:id`.
 *
 * Bucket layout: `uploads/<uuid>`.
 */

export class ObjectNotFoundError extends Error {
  constructor(message = "Object not found") {
    super(message);
    this.name = "ObjectNotFoundError";
  }
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Object storage is not configured (set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)");
    this.name = "StorageNotConfiguredError";
  }
}

const OBJECT_PATH_PREFIX = "/objects/";
const UPLOAD_KEY_PREFIX = "uploads/";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Content types safe to serve inline from our own origin (see routes.ts). */
export const SERVABLE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
]);

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
/** Uploaded objects are immutable (UUID keys), so they can be cached for a year. */
export const OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function isUploadId(id: string): boolean {
  return UUID_RE.test(id);
}

/** `/objects/uploads/<uuid>` -> `uploads/<uuid>` (throws when malformed). */
export function keyForObjectPath(objectPath: string): string {
  if (typeof objectPath !== "string" || !objectPath.startsWith(OBJECT_PATH_PREFIX)) {
    throw new ObjectNotFoundError();
  }
  const key = objectPath.slice(OBJECT_PATH_PREFIX.length);
  const id = key.startsWith(UPLOAD_KEY_PREFIX) ? key.slice(UPLOAD_KEY_PREFIX.length) : "";
  if (!isUploadId(id)) throw new ObjectNotFoundError();
  return `${UPLOAD_KEY_PREFIX}${id}`;
}

export function objectPathForKey(key: string): string {
  return `${OBJECT_PATH_PREFIX}${key}`;
}

/** Extracts `/objects/uploads/<uuid>` from a relative path or an absolute URL, else null. */
export function extractObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  let pathname = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      pathname = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  try {
    return objectPathForKey(keyForObjectPath(pathname));
  } catch {
    return null;
  }
}

export interface ObjectHead {
  contentType: string;
  contentLength: number | null;
  etag: string | null;
}

function requireR2() {
  const r2 = getR2();
  if (!r2) throw new StorageNotConfiguredError();
  return r2;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

export class ObjectStorageService {
  /** Mint a presigned PUT URL for a new upload. The Content-Type is bound into the signature. */
  async createUploadUrl(input: { contentType?: string }): Promise<{ uploadURL: string; objectPath: string }> {
    const { client, bucket } = requireR2();
    const key = `${UPLOAD_KEY_PREFIX}${randomUUID()}`;
    const contentType = input.contentType?.trim() || "application/octet-stream";
    const uploadURL = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return { uploadURL, objectPath: objectPathForKey(key) };
  }

  async headObject(objectPath: string): Promise<ObjectHead | null> {
    const { client, bucket } = requireR2();
    const key = keyForObjectPath(objectPath);
    try {
      const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        contentType: out.ContentType || "application/octet-stream",
        contentLength: typeof out.ContentLength === "number" ? out.ContentLength : null,
        etag: out.ETag ?? null,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /** Read a whole object into memory (bounded). Used for embedding logos in PDFs. */
  async readObject(objectPath: string, maxBytes: number): Promise<{ buffer: Buffer; contentType: string } | null> {
    const { client, bucket } = requireR2();
    const key = keyForObjectPath(objectPath);
    try {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (typeof out.ContentLength === "number" && out.ContentLength > maxBytes) return null;
      const bytes = await out.Body!.transformToByteArray();
      if (bytes.byteLength > maxBytes) return null;
      return { buffer: Buffer.from(bytes), contentType: out.ContentType || "application/octet-stream" };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /** Stream an object to an HTTP response with long-lived cache headers. */
  async streamObject(objectPath: string, req: Request, res: Response): Promise<void> {
    const { client, bucket } = requireR2();
    const key = keyForObjectPath(objectPath);
    const ifNoneMatch = req.get("if-none-match") || undefined;
    let out;
    try {
      out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, IfNoneMatch: ifNoneMatch }));
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e?.$metadata?.httpStatusCode === 304 || e?.name === "NotModified") {
        res.status(304).set("Cache-Control", OBJECT_CACHE_CONTROL).end();
        return;
      }
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
    // Defence in depth against stored XSS: never let an object dictate an
    // active content type on our own origin. Anything outside the upload
    // allow-list (including objects stored before that rule existed, e.g.
    // migrated from the previous provider) is served as an opaque download.
    const storedType = (out.ContentType || "").toLowerCase().split(";")[0].trim();
    const safeType = SERVABLE_CONTENT_TYPES.has(storedType) ? storedType : "application/octet-stream";
    res.set({
      "Content-Type": safeType,
      "Cache-Control": OBJECT_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    });
    if (safeType === "application/octet-stream") {
      res.set("Content-Disposition", "attachment");
    }
    if (typeof out.ContentLength === "number") res.set("Content-Length", String(out.ContentLength));
    if (out.ETag) res.set("ETag", out.ETag);
    if (out.LastModified) res.set("Last-Modified", out.LastModified.toUTCString());

    const body = out.Body as Readable;
    body.on("error", (err) => {
      console.error("[object-storage] stream error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      else res.destroy(err);
    });
    body.pipe(res);
  }

  async deleteObject(objectPath: string): Promise<void> {
    const { client, bucket } = requireR2();
    const key = keyForObjectPath(objectPath);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

export const objectStorage = new ObjectStorageService();
