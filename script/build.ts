import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// Server dependencies that get bundled into dist/*.cjs. Bundling the hot path
// reduces the number of files opened at cold start. Everything else stays
// external and is loaded from node_modules (production deps only) at runtime.
const bundleAllowlist = [
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-session",
  "pg",
  "stripe",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !bundleAllowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts", "server/migrate.ts"],
    outdir: "dist",
    outExtension: { ".js": ".cjs" },
    platform: "node",
    bundle: true,
    format: "cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
