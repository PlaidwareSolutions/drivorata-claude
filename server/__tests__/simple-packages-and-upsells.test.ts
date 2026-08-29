process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-simple-upsells";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { storage } from "../storage";
import {
  users,
  tenants,
  tenantMembers,
  packages,
  locations,
  packageUpsellDependencies,
  carts,
  cartItems,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let locationId: number;
let adminUserId: string;
const createdUserIds: string[] = [];

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": adminUserId,
    "x-test-user-email": `${adminUserId}@spu-test.local`,
  };
}

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) =>
    server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `SPU ${ts}`, slug: `spu-${ts}` })
    .returning();
  tenantId = tenant.id;

  const [loc] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc", address: "1 St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationId = loc.id;

  adminUserId = `spu-admin-${ts}`;
  await db.insert(users).values({
    id: adminUserId,
    email: `${adminUserId}@spu-test.local`,
    firstName: "S",
    lastName: "Admin",
  });
  createdUserIds.push(adminUserId);
  await db.insert(tenantMembers).values({
    tenantId,
    userId: adminUserId,
    role: "tenant_admin",
    status: "ACTIVE",
    active: true,
  });
});

after(async () => {
  try {
    if (tenantId) {
      const cartIds = (
        await db.select({ id: carts.id }).from(carts).where(eq(carts.tenantId, tenantId))
      ).map((c) => c.id);
      if (cartIds.length) await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
      if (cartIds.length) await db.delete(carts).where(inArray(carts.id, cartIds));
      await db
        .delete(packageUpsellDependencies)
        .where(eq(packageUpsellDependencies.tenantId, tenantId));
      await db.delete(packages).where(eq(packages.tenantId, tenantId));
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
      await db.delete(locations).where(eq(locations.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function createPkg(body: any): Promise<any> {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      tenantId,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
      ...body,
    }),
  });
  assert.ok(res.status === 200 || res.status === 201, `unexpected status ${res.status}: ${await res.clone().text()}`);
  return res.json();
}

test("POST /packages creates SIMPLE package and returns kind + sellable/upsell flags", async () => {
  const pkg = await createPkg({
    name: "Road Test SIMPLE",
    price: 12000,
    kind: "SIMPLE",
    sellableStandalone: true,
    availableAsUpsell: false,
  });
  assert.equal(pkg.kind, "SIMPLE");
  assert.equal(pkg.sellableStandalone, true);
  assert.equal(pkg.availableAsUpsell, false);
  // GET endpoint exposes requiresCohortSelection — verify there.
  const getRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    headers: adminHeaders(),
  });
  const fetched = await getRes.json();
  assert.equal(fetched.requiresCohortSelection, false);
});

test("POST /packages with availableAsUpsell + parent ids stores upsellParentPackageIds", async () => {
  const parent = await createPkg({ name: "Parent Pkg", price: 25000, kind: "SIMPLE" });
  const upsell = await createPkg({
    name: "School Car",
    price: 8000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [parent.id],
  });
  assert.deepEqual(upsell.upsellParentPackageIds, [parent.id]);

  const getRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${upsell.id}`, {
    headers: adminHeaders(),
  });
  assert.equal(getRes.status, 200);
  const fetched = await getRes.json();
  assert.deepEqual(fetched.upsellParentPackageIds, [parent.id]);
});

test("storage.addCartItem: upsell-only package rejected without parent in cart, accepted with parent", async () => {
  const parent = await createPkg({
    name: "Road Test Parent",
    price: 9900,
    kind: "SIMPLE",
    sellableStandalone: true,
  });
  const upsell = await createPkg({
    name: "School Car Upsell",
    price: 4900,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [parent.id],
  });

  const [cart] = await db.insert(carts).values({ tenantId }).returning();

  // Empty cart → upsell-only add must be rejected.
  await assert.rejects(
    () => storage.addCartItem(cart.id, upsell.id, null),
    /add-on/i,
  );

  // Add parent first.
  await storage.addCartItem(cart.id, parent.id, null);

  // Now upsell add must succeed.
  const added = await storage.addCartItem(cart.id, upsell.id, null);
  assert.equal(added.packageId, upsell.id);
});

test("storage.listCartUpsells filters by configured dependencies", async () => {
  const parentA = await createPkg({ name: "Parent A", price: 9900, kind: "SIMPLE" });
  const parentB = await createPkg({ name: "Parent B", price: 9900, kind: "SIMPLE" });
  const aOnlyUpsell = await createPkg({
    name: "A-only Upsell",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [parentA.id],
  });

  const [cart] = await db.insert(carts).values({ tenantId }).returning();
  await storage.addCartItem(cart.id, parentB.id, null);
  const upsellsForB = await storage.listCartUpsells(cart.id);
  assert.ok(!upsellsForB.some((p) => p.id === aOnlyUpsell.id), "A-only upsell must not show for cart with only Parent B");

  const [cart2] = await db.insert(carts).values({ tenantId }).returning();
  await storage.addCartItem(cart2.id, parentA.id, null);
  const upsellsForA = await storage.listCartUpsells(cart2.id);
  assert.ok(upsellsForA.some((p) => p.id === aOnlyUpsell.id), "A-only upsell must show for cart with Parent A");
});

test("storage.addCartItem rejects sellable=false + upsell=false (unbookable)", async () => {
  const unbookable = await createPkg({
    name: "Unbookable Pkg",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: false,
  });
  const [cart] = await db.insert(carts).values({ tenantId }).returning();
  await assert.rejects(
    () => storage.addCartItem(cart.id, unbookable.id, null),
    /not available for purchase|add-on/i,
  );

  // listAddOnPackages must not include it.
  const addOns = await storage.listAddOnPackages(tenantId);
  assert.ok(
    !addOns.some((p) => p.id === unbookable.id),
    "unbookable package must not appear in add-ons list",
  );

  // Single-package checkout must refuse it (sellableStandalone=false).
  const slug = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].slug;
  const checkoutRes = await fetch(`${baseUrl}/api/public/tenant/${slug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      packageId: unbookable.id,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(checkoutRes.status, 400);
});

test("POST /packages defaults audience to BOTH when omitted", async () => {
  const pkg = await createPkg({
    name: "Audience Default Pkg",
    price: 1000,
    kind: "SIMPLE",
  });
  assert.equal(pkg.audience, "BOTH");

  const getRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    headers: adminHeaders(),
  });
  const fetched = await getRes.json();
  assert.equal(fetched.audience, "BOTH");
});

test("POST /packages round-trips audience for TEENS / ADULTS / BOTH", async () => {
  for (const audience of ["TEENS", "ADULTS", "BOTH"] as const) {
    const pkg = await createPkg({
      name: `Audience ${audience} Pkg`,
      price: 1000,
      kind: "SIMPLE",
      audience,
    });
    assert.equal(pkg.audience, audience);

    const getRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
      headers: adminHeaders(),
    });
    const fetched = await getRes.json();
    assert.equal(fetched.audience, audience);
  }
});

test("POST /packages defaults tier to PRIMARY when omitted", async () => {
  const pkg = await createPkg({ name: "Tier Default Pkg", price: 1000, kind: "SIMPLE" });
  assert.equal(pkg.tier, "PRIMARY");
});

test("POST /packages round-trips tier PRIMARY / AUXILIARY and PATCH updates in place", async () => {
  for (const tier of ["PRIMARY", "AUXILIARY"] as const) {
    const pkg = await createPkg({
      name: `Tier ${tier} Pkg`,
      price: 1000,
      kind: "SIMPLE",
      tier,
    });
    assert.equal(pkg.tier, tier);
  }
  const pkg = await createPkg({ name: "Tier Patch Pkg", price: 1000, kind: "SIMPLE", tier: "PRIMARY" });
  const patchRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ tier: "AUXILIARY" }),
  });
  assert.equal(patchRes.status, 200);
  assert.equal((await patchRes.json()).tier, "AUXILIARY");
});

test("Public packages list returns PRIMARY packages before AUXILIARY packages", async () => {
  const aux = await createPkg({
    name: "ZZZ-Aux-Sort-Test",
    price: 1000,
    kind: "SIMPLE",
    tier: "AUXILIARY",
  });
  const prim = await createPkg({
    name: "ZZZ-Primary-Sort-Test",
    price: 1000,
    kind: "SIMPLE",
    tier: "PRIMARY",
  });
  // Both are SIMPLE + default sellableStandalone=true, so both appear publicly.
  const tenantRow = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0];
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantRow.slug}/packages`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ id: number; tier: string }>;
  const primIdx = list.findIndex((p) => p.id === prim.id);
  const auxIdx = list.findIndex((p) => p.id === aux.id);
  assert.notEqual(primIdx, -1, "primary package should appear in public list");
  assert.notEqual(auxIdx, -1, "auxiliary package should appear in public list");
  assert.ok(primIdx < auxIdx, `expected PRIMARY before AUXILIARY (primIdx=${primIdx}, auxIdx=${auxIdx})`);
  // Ensure no AUXILIARY appears before any PRIMARY anywhere in the list.
  let seenAux = false;
  for (const p of list) {
    if ((p.tier ?? "PRIMARY") === "AUXILIARY") seenAux = true;
    else if (seenAux) assert.fail(`PRIMARY package ${p.id} appeared after an AUXILIARY package`);
  }
});

test("PATCH /packages updates audience in place", async () => {
  const pkg = await createPkg({
    name: "Audience Patch Pkg",
    price: 1000,
    kind: "SIMPLE",
    audience: "TEENS",
  });
  assert.equal(pkg.audience, "TEENS");

  const patchRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ audience: "ADULTS" }),
  });
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.audience, "ADULTS");

  const getRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    headers: adminHeaders(),
  });
  const fetched = await getRes.json();
  assert.equal(fetched.audience, "ADULTS");
});

test("POST /packages defaults language to ENGLISH and imageUrl to null when omitted", async () => {
  const pkg = await createPkg({
    name: "Lang Default Pkg",
    price: 1000,
    kind: "SIMPLE",
  });
  assert.equal(pkg.language, "ENGLISH");
  assert.equal(pkg.imageUrl ?? null, null);

  const getRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    headers: adminHeaders(),
  });
  const fetched = await getRes.json();
  assert.equal(fetched.language, "ENGLISH");
  assert.equal(fetched.imageUrl ?? null, null);
});

test("POST /packages round-trips language ENGLISH/SPANISH and imageUrl, exposed on public endpoints", async () => {
  const slug = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].slug;
  for (const language of ["ENGLISH", "SPANISH"] as const) {
    const pkg = await createPkg({
      name: `Lang ${language} Pkg`,
      price: 1000,
      kind: "SIMPLE",
      language,
      imageUrl: `https://cdn.test/${language.toLowerCase()}.png`,
    });
    assert.equal(pkg.language, language);
    assert.equal(pkg.imageUrl, `https://cdn.test/${language.toLowerCase()}.png`);

    const detailRes = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages/${pkg.id}`);
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.equal(detail.language, language);
    assert.equal(detail.imageUrl, `https://cdn.test/${language.toLowerCase()}.png`);

    const listRes = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages`);
    const list: any[] = await listRes.json();
    const fromList = list.find((p) => p.id === pkg.id);
    assert.equal(fromList?.language, language);
    assert.equal(fromList?.imageUrl, `https://cdn.test/${language.toLowerCase()}.png`);
  }
});

test("PATCH /packages updates language and imageUrl in place", async () => {
  const pkg = await createPkg({
    name: "Lang Patch Pkg",
    price: 1000,
    kind: "SIMPLE",
    language: "ENGLISH",
  });
  assert.equal(pkg.language, "ENGLISH");

  const patchRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ language: "SPANISH", imageUrl: "https://cdn.test/new.png" }),
  });
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.language, "SPANISH");
  assert.equal(patched.imageUrl, "https://cdn.test/new.png");

  const getRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    headers: adminHeaders(),
  });
  const fetched = await getRes.json();
  assert.equal(fetched.language, "SPANISH");
  assert.equal(fetched.imageUrl, "https://cdn.test/new.png");
});

test("derivePackageChannels covers all four flag combinations", async () => {
  const { derivePackageChannels } = await import("@shared/schema");
  assert.deepEqual(derivePackageChannels({ sellableStandalone: true, availableAsUpsell: false }), ["catalog"]);
  assert.deepEqual(derivePackageChannels({ sellableStandalone: false, availableAsUpsell: true }), ["upsell"]);
  assert.deepEqual(derivePackageChannels({ sellableStandalone: true, availableAsUpsell: true }), ["catalog", "upsell"]);
  assert.deepEqual(derivePackageChannels({ sellableStandalone: false, availableAsUpsell: false }), []);
});

test("Public package responses include derived channels field", async () => {
  const slug = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].slug;

  // catalog-only
  const catalogOnly = await createPkg({
    name: "Channels Catalog Only",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: true,
    availableAsUpsell: false,
  });
  // upsell-only
  const upsellOnly = await createPkg({
    name: "Channels Upsell Only",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
  });
  // both
  const both = await createPkg({
    name: "Channels Both",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: true,
    availableAsUpsell: true,
  });

  // Public packages list — catalog-only and both should appear with channels.
  const listRes = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages`);
  assert.equal(listRes.status, 200);
  const list: any[] = await listRes.json();
  const fromList = (id: number) => list.find((p) => p.id === id);
  assert.deepEqual(fromList(catalogOnly.id)?.channels, ["catalog"]);
  assert.deepEqual(fromList(both.id)?.channels, ["catalog", "upsell"]);
  assert.equal(fromList(upsellOnly.id), undefined, "upsell-only must stay hidden from catalog list");

  // Add-ons endpoint — upsell-only and both should appear.
  const addOnsRes = await fetch(`${baseUrl}/api/public/tenant/${slug}/add-ons`);
  assert.equal(addOnsRes.status, 200);
  const addOns: any[] = await addOnsRes.json();
  const fromAddOns = (id: number) => addOns.find((p) => p.id === id);
  assert.deepEqual(fromAddOns(upsellOnly.id)?.channels, ["upsell"]);
  assert.deepEqual(fromAddOns(both.id)?.channels, ["catalog", "upsell"]);

  // Admin (package detail) endpoint exposes channels too.
  const detailRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${both.id}`, {
    headers: adminHeaders(),
  });
  assert.equal(detailRes.status, 200);
  const detail = await detailRes.json();
  assert.deepEqual(detail.channels, ["catalog", "upsell"]);

  // Cart upsells endpoint — seed a cart with the catalog-only as parent so
  // the upsell-only (no dependencies = legacy fallback) shows up, then verify
  // channels are attached to each returned upsell.
  const [cart] = await db.insert(carts).values({ tenantId }).returning();
  await storage.addCartItem(cart.id, catalogOnly.id, null);
  const upsellsRes = await fetch(`${baseUrl}/api/public/cart/${cart.id}/upsells`);
  assert.equal(upsellsRes.status, 200);
  const upsells: any[] = await upsellsRes.json();
  for (const p of upsells) {
    assert.ok(Array.isArray(p.channels), "every cart upsell must include a channels array");
  }
  const upsellOnlyInCart = upsells.find((p) => p.id === upsellOnly.id);
  if (upsellOnlyInCart) {
    assert.deepEqual(upsellOnlyInCart.channels, ["upsell"]);
  }
});

test("Public package detail returns relatedUpsells (explicit parent + legacy generic + filters self)", async () => {
  const slug = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].slug;

  // Parent package: cohort-based with classroom hours so legacy generic
  // add-on rule will surface a generic upsell for it.
  const parent = await createPkg({
    name: "Detail Parent",
    price: 30000,
    kind: "COHORT_BASED",
    classroomHoursRequired: 32,
    sellableStandalone: true,
  });

  // Explicit-parent upsell: should appear only when this parent is the package being viewed.
  const explicitUpsell = await createPkg({
    name: "Detail Explicit Upsell",
    price: 5000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [parent.id],
  });

  // Legacy generic add-on: no upsellParentPackageIds, no classroom/drive hours →
  // legacy fallback says "always relevant".
  const genericUpsell = await createPkg({
    name: "Detail Generic Upsell",
    price: 1500,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
  });

  // An upsell for some unrelated parent — must NOT appear in this detail response.
  const otherParent = await createPkg({ name: "Detail Other Parent", price: 9900, kind: "SIMPLE" });
  const otherUpsell = await createPkg({
    name: "Detail Other-only Upsell",
    price: 2000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [otherParent.id],
  });

  const res = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages/${parent.id}`);
  assert.equal(res.status, 200);
  const body: any = await res.json();
  assert.equal(body.id, parent.id);
  assert.equal(body.requiresCohortSelection, true);
  assert.ok(Array.isArray(body.relatedUpsells), "relatedUpsells should be an array");
  const ids = body.relatedUpsells.map((p: any) => p.id);
  assert.ok(ids.includes(explicitUpsell.id), "explicit-parent upsell must appear");
  assert.ok(ids.includes(genericUpsell.id), "legacy generic upsell must appear");
  assert.ok(!ids.includes(otherUpsell.id), "upsell for unrelated parent must NOT appear");
  assert.ok(!ids.includes(parent.id), "parent itself must not appear in its own related upsells");

  // Each entry should carry the same shape used by /cart/:id/upsells.
  const explicitEntry = body.relatedUpsells.find((p: any) => p.id === explicitUpsell.id);
  assert.equal(explicitEntry.kind, "SIMPLE");
  assert.equal(explicitEntry.requiresCohortSelection, false);
  assert.deepEqual(explicitEntry.upsellParentPackageIds, [parent.id]);

  // A package that has no matching upsells should return an empty array.
  const lonely = await createPkg({
    name: "Lonely Standalone",
    price: 100,
    kind: "SIMPLE",
    sellableStandalone: true,
  });
  const lonelyRes = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages/${lonely.id}`);
  assert.equal(lonelyRes.status, 200);
  const lonelyBody: any = await lonelyRes.json();
  // Generic upsells still match (legacy "always relevant"), but the explicit-parent ones must not.
  const lonelyIds = lonelyBody.relatedUpsells.map((p: any) => p.id);
  assert.ok(!lonelyIds.includes(explicitUpsell.id), "explicit-parent upsell must not appear for unrelated package");
  assert.ok(!lonelyIds.includes(otherUpsell.id), "other-parent upsell must not appear for unrelated package");
});

test("Public package detail filters relatedUpsells by package location scope when no locationId is given", async () => {
  const slug = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].slug;

  // Add a second location so we can scope packages to specific spots.
  const [locB] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc B", address: "2 St", city: "Austin", state: "TX", zip: "78702" })
    .returning();

  // Restricted parent: only available at locationId (the original loc).
  const restrictedParent = await createPkg({
    name: "Restricted Parent",
    price: 30000,
    kind: "SIMPLE",
    sellableStandalone: true,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locationId],
  });

  // Upsell scoped to the OTHER location only — must NOT appear.
  const otherLocUpsell = await createPkg({
    name: "Upsell Other Loc Only",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [restrictedParent.id],
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locB.id],
  });

  // Upsell scoped to the SAME location → must appear.
  const sameLocUpsell = await createPkg({
    name: "Upsell Same Loc",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [restrictedParent.id],
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locationId],
  });

  // ALL_LOCATIONS upsell → must appear.
  const allLocUpsell = await createPkg({
    name: "Upsell All Locs",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
    upsellParentPackageIds: [restrictedParent.id],
  });

  const res = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages/${restrictedParent.id}`);
  assert.equal(res.status, 200);
  const body: any = await res.json();
  const ids = body.relatedUpsells.map((p: any) => p.id);
  assert.ok(!ids.includes(otherLocUpsell.id), "upsell scoped to a different location must be filtered out");
  assert.ok(ids.includes(sameLocUpsell.id), "upsell scoped to a matching location must appear");
  assert.ok(ids.includes(allLocUpsell.id), "ALL_LOCATIONS upsell must appear");

  // Asking for the wrong location explicitly should 404 the package itself.
  const wrongLocRes = await fetch(
    `${baseUrl}/api/public/tenant/${slug}/packages/${restrictedParent.id}?locationId=${locB.id}`,
  );
  assert.equal(wrongLocRes.status, 404);
});

test("Public package detail 404s for non-sellable packages", async () => {
  const slug = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].slug;
  const upsellOnly = await createPkg({
    name: "Detail Hidden Upsell-only",
    price: 500,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
  });
  const res = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages/${upsellOnly.id}`);
  assert.equal(res.status, 404);
});

test("Public packages list hides sellableStandalone=false packages", async () => {
  const slug = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].slug;
  const visible = await createPkg({
    name: "Visible Standalone",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: true,
  });
  const hidden = await createPkg({
    name: "Hidden Upsell-only",
    price: 500,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
  });
  const res = await fetch(`${baseUrl}/api/public/tenant/${slug}/packages`);
  assert.equal(res.status, 200);
  const list: any[] = await res.json();
  const ids = list.map((p) => p.id);
  assert.ok(ids.includes(visible.id), "standalone package must appear in public list");
  assert.ok(!ids.includes(hidden.id), "upsell-only package must be hidden from public list");
});
