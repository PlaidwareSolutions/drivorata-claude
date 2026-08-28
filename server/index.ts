import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cors from "cors";
import { seedPromotions } from "./seed-promotions";
import { seedOnlineCourses } from "./seed-online-courses";
import { storage } from "./storage";
import { pool } from "./db";

const app = express();

app.use("/api/public", cors({ origin: true, credentials: false }));
app.use("/api/payments/paypal/return", cors({ origin: true, credentials: false }));
app.use("/api/webhooks", cors({ origin: true, credentials: false }));
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Platform health check (Railway healthcheckPath). Registered before the
// tenant/auth middleware so it never requires a session or tenant header.
app.get("/api/health", async (_req, res) => {
  const dbCheck = pool.query("SELECT 1");
  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error("db health check timed out")), 2000);
    t.unref();
  });
  try {
    await Promise.race([dbCheck, timeout]);
    res.json({ status: "ok", db: "ok" });
  } catch (err) {
    console.error("[health] database unreachable:", err);
    res.status(503).json({ status: "degraded", db: "unreachable" });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api") && path !== "/api/health") {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// Idempotent per-tenant seeds (promotions, online-course catalog). Opt-in via
// BOOT_SEED_TENANT_IDS so a fresh deployment doesn't mutate arbitrary tenants.
function bootSeedTenantIds(): number[] {
  return (process.env.BOOT_SEED_TENANT_IDS ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

(async () => {
  await registerRoutes(httpServer, app);
  for (const tenantId of bootSeedTenantIds()) {
    seedPromotions(tenantId).catch((err) => console.error(`Failed to seed promotions for tenant ${tenantId}:`, err));
    seedOnlineCourses(tenantId).catch((err) => console.error(`Failed to seed online courses for tenant ${tenantId}:`, err));
  }
  storage
    .backfillContactSubmissionReplyTokens()
    .then((n) => {
      if (n > 0) log(`Backfilled reply tokens for ${n} contact submission(s)`);
    })
    .catch((err) => console.error("Failed to backfill contact submission reply tokens:", err));

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Serve API + client on the platform-provided PORT (Railway injects it).
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown: Railway sends SIGTERM on redeploy/scale-down. Stop
  // accepting connections, let in-flight requests finish, then close the pool.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received, shutting down`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    httpServer.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
