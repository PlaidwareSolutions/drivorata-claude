import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

declare module "express-session" {
  interface SessionData {
    userId: string;
    userEmail: string;
  }
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. It signs session cookies and unsubscribe/reply tokens; " +
        "use the same value across deploys so existing sessions and links stay valid.",
    );
  }
  return secret;
}

/**
 * Express `trust proxy` setting. Railway's edge is one hop (default `1`).
 * Accepts a hop count, `true`/`false`, or a comma-separated list of
 * addresses / CIDRs (e.g. `loopback, 100.0.0.0/8`).
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const v = (raw ?? "").trim();
  if (v === "") return 1;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  return v;
}

/** Secure cookies in production (HTTPS terminated at the edge); override with COOKIE_SECURE. */
export function cookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return process.env.NODE_ENV === "production";
}

export function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false, // `sessions` is part of the Drizzle schema/migrations
    ttl: SESSION_TTL_MS,
    tableName: "sessions",
  });
  return session({
    secret: requireSessionSecret(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      maxAge: SESSION_TTL_MS,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

  if (process.env.TEST_AUTH_BYPASS === "1" && process.env.NODE_ENV === "test") {
    app.use((req: any, _res, next) => {
      const testUserId = req.headers["x-test-user-id"];
      if (testUserId) {
        const sub = String(testUserId);
        const email = req.headers["x-test-user-email"]
          ? String(req.headers["x-test-user-email"])
          : undefined;
        req.session = { userId: sub, userEmail: email } as any;
        req.user = { claims: { sub, email } };
      }
      next();
    });
    return;
  }

  app.use(getSession());

  app.use((req: any, _res, next) => {
    if (req.session?.userId) {
      req.user = {
        claims: {
          sub: req.session.userId,
          email: req.session.userEmail,
        },
      };
    }
    next();
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (
    process.env.TEST_AUTH_BYPASS === "1" &&
    process.env.NODE_ENV === "test" &&
    (req as any).user?.claims?.sub
  ) {
    return next();
  }
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};
