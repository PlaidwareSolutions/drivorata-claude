/**
 * One-time copy of uploaded objects from the Replit deployment into R2.
 *
 * Strategy: the DB is the source of truth for which objects matter. Every
 * column that can hold an upload reference is scanned for
 * "/objects/uploads/<uuid>" values; each object is downloaded from the still-
 * running Replit deployment's public proxy (SOURCE_OBJECTS_BASE_URL) and
 * PUT into R2 under the same key, preserving Content-Type. Objects already
 * present in R2 are skipped, so the script is safe to re-run for deltas.
 *
 * A second pass (--rewrite-absolute) looks for absolute GCS / Replit URLs in
 * the free-text URL columns, copies those objects too when reachable, and
 * rewrites the column to the canonical "/objects/uploads/<uuid>" form.
 *
 * Usage:
 *   DATABASE_URL=... SOURCE_OBJECTS_BASE_URL=https://drivorata.com \
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... \
 *     npx tsx scripts/migrate-objects-to-r2.ts [--rewrite-absolute]
 *   DRY_RUN=1 ... to only report.
 */
import { sql } from "drizzle-orm";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db, pool } from "../server/db";
import { getR2 } from "../server/object-storage/client";
import { extractObjectPath, keyForObjectPath, objectPathForKey } from "../server/object-storage/service";
import { randomUUID } from "crypto";

const DRY_RUN = process.env.DRY_RUN === "1";
const REWRITE_ABSOLUTE = process.argv.includes("--rewrite-absolute");
const SOURCE = (process.env.SOURCE_OBJECTS_BASE_URL ?? "").replace(/\/+$/, "");
const LEGACY_HOST_RE = /^https:\/\/([a-z0-9.-]*\.)?(storage\.googleapis\.com|replit\.com)\//i;

interface ColumnRef {
  table: string;
  column: string;
  idColumn: string;
}

const COLUMNS: ColumnRef[] = [
  { table: "media", column: "object_path", idColumn: "id" },
  { table: "packages", column: "image_url", idColumn: "id" },
  { table: "online_courses", column: "image_url", idColumn: "id" },
  { table: "tenants", column: "logo_url", idColumn: "id" },
  { table: "users", column: "profile_image_url", idColumn: "id" },
  { table: "testimonials", column: "photo_url", idColumn: "id" },
];

async function listValues(ref: ColumnRef): Promise<Array<{ id: string; value: string }>> {
  const result = await db.execute(
    sql.raw(`SELECT ${ref.idColumn}::text AS id, ${ref.column} AS value FROM ${ref.table} WHERE ${ref.column} IS NOT NULL AND ${ref.column} <> ''`),
  );
  const rows = ((result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as Array<{ id: string; value: string }>;
  return rows;
}

async function existsInR2(key: string): Promise<boolean> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  try {
    await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
    return true;
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function copyToR2(sourceUrl: string, key: string): Promise<{ ok: boolean; reason?: string; bytes?: number }> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  const resp = await fetch(sourceUrl, { redirect: "follow" });
  if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` };
  const contentType = resp.headers.get("content-type") || "application/octet-stream";
  const body = Buffer.from(await resp.arrayBuffer());
  if (DRY_RUN) return { ok: true, bytes: body.byteLength };
  await r2.client.send(
    new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: body, ContentType: contentType }),
  );
  return { ok: true, bytes: body.byteLength };
}

async function main(): Promise<void> {
  if (!SOURCE) throw new Error("SOURCE_OBJECTS_BASE_URL must be set (e.g. https://drivorata.com)");
  if (!getR2()) throw new Error("R2_* environment variables must be set");
  console.log(`Object migration: source=${SOURCE} dry_run=${DRY_RUN} rewrite_absolute=${REWRITE_ABSOLUTE}`);

  const objectPaths = new Set<string>();
  const absoluteRefs: Array<{ ref: ColumnRef; id: string; value: string }> = [];

  for (const ref of COLUMNS) {
    const rows = await listValues(ref);
    for (const row of rows) {
      const objectPath = extractObjectPath(row.value);
      if (objectPath) {
        objectPaths.add(objectPath);
      } else if (LEGACY_HOST_RE.test(row.value)) {
        absoluteRefs.push({ ref, id: row.id, value: row.value });
      }
    }
    console.log(`  ${ref.table}.${ref.column}: ${rows.length} value(s)`);
  }

  console.log(`\nCopying ${objectPaths.size} object(s) referenced by path...`);
  let copied = 0, skipped = 0, failed = 0, bytes = 0;
  for (const objectPath of objectPaths) {
    const key = keyForObjectPath(objectPath);
    if (await existsInR2(key)) { skipped++; continue; }
    const r = await copyToR2(`${SOURCE}${objectPath}`, key);
    if (r.ok) { copied++; bytes += r.bytes ?? 0; console.log(`  copied ${objectPath} (${r.bytes} bytes)`); }
    else { failed++; console.warn(`  FAILED ${objectPath}: ${r.reason}`); }
  }
  console.log(`Done: copied=${copied} skipped_existing=${skipped} failed=${failed} bytes=${bytes}${DRY_RUN ? " (dry-run)" : ""}`);

  if (absoluteRefs.length > 0) {
    console.log(`\n${absoluteRefs.length} absolute legacy URL(s) found in free-text columns:`);
    for (const a of absoluteRefs) console.log(`  ${a.ref.table}#${a.id}.${a.ref.column} = ${a.value}`);
    if (REWRITE_ABSOLUTE) {
      console.log("Copying + rewriting...");
      for (const a of absoluteRefs) {
        const key = `uploads/${randomUUID()}`;
        const r = await copyToR2(a.value, key);
        if (!r.ok) { console.warn(`  FAILED ${a.ref.table}#${a.id}: ${r.reason} (left unchanged)`); continue; }
        const newValue = objectPathForKey(key);
        if (!DRY_RUN) {
          await db.execute(
            sql.raw(`UPDATE ${a.ref.table} SET ${a.ref.column} = '${newValue}' WHERE ${a.ref.idColumn}::text = '${a.id.replace(/'/g, "''")}'`),
          );
        }
        console.log(`  ${a.ref.table}#${a.id}.${a.ref.column} -> ${newValue}${DRY_RUN ? " (dry-run)" : ""}`);
      }
    } else {
      console.log("Re-run with --rewrite-absolute to copy these into R2 and rewrite the columns.");
    }
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Object migration failed:", err);
    process.exit(1);
  });
