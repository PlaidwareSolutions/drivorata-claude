/**
 * Railway Infrastructure as Code for Drivorata.
 *
 *   railway link                 # link this directory to the Drivorata project
 *   railway config plan          # preview changes (always run first)
 *   railway config apply         # apply after reviewing the plan
 *
 * Secrets are NOT stored here. Variables marked `preserveExisting` keep the
 * value set in the Railway dashboard; set them there before the first deploy
 * (see docs/DEPLOYMENT.md for the full list and .env.example for meaning).
 */
import { defineRailway, github, postgres, project, service } from "railway/iac";

const secret = (description: string) => ({ description, preserveExisting: true });

export default defineRailway(() => {
  // Name must match the Railway service exactly, or config apply proposes
  // destroying and recreating the database.
  const db = postgres("Postgres");

  const web = service("drivorata", {
    source: github("PlaidwareSolutions/drivorata-claude", { branch: "main" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      startCommand: "node dist/index.cjs",
      preDeployCommand: ["node dist/migrate.cjs"],
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      numReplicas: 1,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      drainingSeconds: 15,
    },
    // Custom domains are NOT managed here — Railway config rejects them.
    // Add them with `railway domain <name>` (or the dashboard), then create the
    // CNAME + _railway-verify TXT records it prints. See docs/DEPLOYMENT.md §1.4.
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      APP_BASE_URL: "https://drivorata.com",
      VITE_PLATFORM_DOMAIN: "drivorata.com", // build-time (Docker ARG)
      TRUST_PROXY: "1",
      CLIENT_IP_HEADER: "x-real-ip",
      // NOT a literal: during a rehearsal this is set to "0" so reminder jobs cannot
      // email real customers from restored production data. A literal here would let
      // `railway config apply` silently re-enable them mid-rehearsal. Operator-controlled;
      // set back to "1" at cutover (see docs/MIGRATION-RUNBOOK.md §2).
      BACKGROUND_JOBS_ENABLED: { description: "1 = run reminder/cleanup jobs; 0 during rehearsal", preserveExisting: true },
      STALE_CREDIT_REMINDER_INTERVAL_MINUTES: "60",
      CART_REMINDER_INTERVAL_MINUTES: "60",
      PORTAL_CNAME_TARGET: "saas.drivorata.com",
      R2_BUCKET: "drivorata-uploads",
      // Must be an address on a domain VERIFIED IN RESEND. drivorata.com is not
      // verified there; production sends from contact.plaidware.com. Getting this
      // wrong makes every outgoing email fail with a provider error.
      SESSION_EMAIL_FROM: "Drivorata <no-reply@contact.plaidware.com>",
      // ---- secrets (set in the dashboard) ----
      SESSION_SECRET: secret("Signs sessions and unsubscribe/reply tokens — copy the exact value from Replit"),
      UNSUBSCRIBE_SECRET: secret("Copy from Replit"),
      RESEND_API_KEY: secret("Resend API key"),
      RESEND_WEBHOOK_SECRET: secret("Resend webhook signing secret"),
      INBOUND_WEBHOOK_SECRET: secret("Resend inbound webhook secret"),
      // Intentionally optional: when unset, buildReplyToAddress() derives the domain
      // from SESSION_EMAIL_FROM (contact.plaidware.com), which is what production does.
      INBOUND_REPLY_DOMAIN: { description: "Overrides the reply+<token>@ domain; defaults to the SESSION_EMAIL_FROM domain", isOptional: true, preserveExisting: true },
      R2_ACCOUNT_ID: secret("Cloudflare account id"),
      R2_ACCESS_KEY_ID: secret("R2 API token access key"),
      R2_SECRET_ACCESS_KEY: secret("R2 API token secret"),
      R2_PUBLIC_BASE_URL: { description: "Optional public bucket domain", isOptional: true, preserveExisting: true },
      CLOUDFLARE_API_TOKEN: secret("Zone → SSL and Certificates → Edit"),
      CLOUDFLARE_ZONE_ID: secret("drivorata.com zone id"),
      PORTAL_PROXY_SECRET: secret("Shared with the portal-proxy Worker"),
    },
  });

  return project("drivorata", { resources: [web, db] });
});
