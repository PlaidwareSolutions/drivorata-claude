import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

declare module "express-session" {
  interface SessionData {
    userId: string;
    userEmail: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.REPL_ID !== undefined,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

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
