export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Drivorata Public API",
    description:
      "Headless API for connecting external driving school websites to Drivorata. All endpoints (except /resolve) require a valid API key. Generate keys from Settings > API Access in your admin dashboard.\n\n**Authentication:** Pass your key via `Authorization: Bearer drv_live_...` header or `x-api-key: drv_live_...` header.",
    version: "1.0.0",
    contact: {
      name: "Drivorata Support",
      email: "solutions@plaidware.com",
    },
  },
  servers: [
    {
      url: "/",
      description: "Current server",
    },
  ],
  tags: [
    { name: "School Data", description: "Read school information, packages, locations, promotions, and theme" },
    { name: "Online Courses", description: "Browse and purchase third-party online courses resold by the school" },
    { name: "Schedule", description: "Read upcoming sessions and instructor info" },
    { name: "Enrollment", description: "Start enrollment checkout and check status" },
    { name: "Contact", description: "Submit contact form inquiries to the school" },
    { name: "Resolution", description: "Resolve hostnames to tenant slugs" },
    { name: "Office Scheduling", description: "Admin-only: BTW/Road-Test office scheduling, in-class gating, and session reschedule. Requires session-cookie auth (admin dashboard) — not available with API key." },
    { name: "Announcements", description: "Storefront announcement banner. The public read endpoint is API-key authenticated; the admin CRUD endpoints require session-cookie auth (admin dashboard) — not available with API key." },
  ],
  paths: {
    "/api/public/tenant/{slug}": {
      get: {
        tags: ["School Data"],
        summary: "Get full school data",
        description:
          "Returns complete public data for a school including tenant info, theme, published pages, active packages, and active locations. Pass `locationId` to filter the returned `packages` to only those available at a specific location — school-wide packages (locationScopeMode = ALL_LOCATIONS) are always included.",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "The school's unique slug identifier",
            schema: { type: "string" },
            example: "sunshine-driving",
          },
          {
            name: "locationId",
            in: "query",
            required: false,
            description: "Optional location ID. If provided, the `packages` array only includes packages allowed at that location plus all school-wide packages.",
            schema: { type: "integer" },
            example: 12,
          },
        ],
        responses: {
          "200": {
            description: "School data retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tenant: {
                      type: "object",
                      properties: {
                        id: { type: "integer", example: 1 },
                        name: { type: "string", example: "Sunshine Driving School" },
                        slug: { type: "string", example: "sunshine-driving" },
                        logoUrl: { type: "string", nullable: true, example: "https://example.com/logo.png" },
                        phone: { type: "string", nullable: true, example: "(512) 555-0100" },
                        email: { type: "string", nullable: true, example: "info@sunshinedrivingschool.com" },
                        customDomain: { type: "string", nullable: true, example: "www.teslamodcenter.com", description: "Verified custom domain, or null if none" },
                      },
                    },
                    theme: {
                      type: "object",
                      nullable: true,
                      description: "School's theme settings (colors, fonts, etc.)",
                    },
                    pages: {
                      type: "array",
                      description: "Published pages with sections",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          title: { type: "string" },
                          slug: { type: "string" },
                          sections: { type: "array", items: { type: "object" } },
                          showInNav: { type: "boolean" },
                          sortOrder: { type: "integer" },
                        },
                      },
                    },
                    packages: { type: "array", items: { $ref: "#/components/schemas/Package" } },
                    locations: { type: "array", items: { $ref: "#/components/schemas/Location" } },
                    globalHeader: { type: "array", items: { type: "object" } },
                    globalFooter: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/packages": {
      get: {
        tags: ["School Data"],
        summary: "Get active packages",
        description: "Returns all active course packages offered by the school. Prices are in cents (e.g., 29900 = $299.00). Pass `locationId` to filter to packages available at a specific location — school-wide packages (locationScopeMode = ALL_LOCATIONS) are always included.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
          {
            name: "locationId",
            in: "query",
            required: false,
            schema: { type: "integer" },
            description: "Optional. Filter packages to those available at the given location id.",
            example: 1,
          },
        ],
        responses: {
          "200": {
            description: "List of active packages",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Package" } },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/locations": {
      get: {
        tags: ["School Data"],
        summary: "Get active locations",
        description: "Returns all active school locations with addresses and contact info.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        responses: {
          "200": {
            description: "List of active locations",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Location" } },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/promotions": {
      get: {
        tags: ["School Data"],
        summary: "Get promotions",
        description:
          "Returns promotional offers for the school. Use `active=true` to get only currently valid promotions (active flag is true and current date is within validFrom/validUntil range). Use `locationId` to filter by a specific location — school-wide promotions (locationId = null) are always included.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
          { name: "active", in: "query", required: false, description: "When set to 'true', returns only active promotions within their valid date range", schema: { type: "string", enum: ["true"] } },
          { name: "locationId", in: "query", required: false, description: "Filter by location ID. School-wide promotions (no location) are always included.", schema: { type: "integer" }, example: 1 },
        ],
        responses: {
          "200": {
            description: "List of promotions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    promotions: { type: "array", items: { $ref: "#/components/schemas/Promotion" } },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid locationId parameter", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/testimonials": {
      get: {
        tags: ["School Data"],
        summary: "Get testimonials",
        description:
          "Returns approved and featured testimonials for the school, sorted by `sortOrder` ascending then most recent. Use `featured=true` to limit to featured testimonials. Use `location` to filter by a specific location — school-wide testimonials (no location) are always included.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
          { name: "featured", in: "query", required: false, description: "When 'true', returns only featured testimonials", schema: { type: "string", enum: ["true"] } },
          { name: "location", in: "query", required: false, description: "Filter by location ID; school-wide testimonials are always included", schema: { type: "integer" }, example: 1 },
        ],
        responses: {
          "200": {
            description: "List of testimonials",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    testimonials: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          name: { type: "string" },
                          rating: { type: "integer", minimum: 1, maximum: 5 },
                          quote: { type: "string" },
                          photoUrl: { type: "string", nullable: true },
                          videoUrl: { type: "string", nullable: true },
                          source: { type: "string", enum: ["in_person", "google", "facebook", "yelp", "public_form", "other"] },
                          status: { type: "string", enum: ["approved", "featured"] },
                          locationId: { type: "integer", nullable: true },
                          sortOrder: { type: "integer" },
                          approvedAt: { type: "string", format: "date-time", nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        tags: ["School Data"],
        summary: "Submit a testimonial",
        description:
          "Public endpoint for visitors to submit a testimonial from a marketing site form. Submissions are always created with status 'pending' and require moderation in the admin dashboard before appearing on the public GET endpoint. Rate limited to 5 submissions per IP per hour.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "rating", "quote"],
                properties: {
                  name: { type: "string", maxLength: 120, example: "Maria S." },
                  email: { type: "string", format: "email", nullable: true },
                  rating: { type: "integer", minimum: 1, maximum: 5, example: 5 },
                  quote: { type: "string", minLength: 5, maxLength: 2000, example: "Great instructors and easy scheduling!" },
                  photoUrl: { type: "string", format: "uri", nullable: true },
                  locationId: { type: "integer", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Testimonial submitted (pending moderation)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    status: { type: "string", example: "pending" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/schedule-offerings": {
      get: {
        tags: ["School Data"],
        summary: "Get active schedule offerings",
        description:
          "Returns published, non-cancelled IN_CLASS schedule offerings (named cohorts) for the school, including the IDs of the packages each offering can fulfill.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        responses: {
          "200": {
            description: "List of active schedule offerings",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      name: { type: "string" },
                      description: { type: "string", nullable: true },
                      locationId: { type: "integer", nullable: true },
                      capacity: { type: "integer" },
                      enrolledCount: { type: "integer" },
                      startsAt: { type: "string", format: "date-time" },
                      endsAt: { type: "string", format: "date-time" },
                      status: { type: "string", enum: ["DRAFT", "PUBLISHED", "FULL", "CANCELLED", "COMPLETED"] },
                      packageId: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/online-courses": {
      get: {
        tags: ["Online Courses"],
        summary: "Get active online courses",
        description: "Returns all active third-party online courses offered by the school, sorted by sort order. Prices are in cents (e.g., 4900 = $49.00). Pass `locationId` to filter to courses available at a specific location — school-wide courses (locationScopeMode = ALL_LOCATIONS) are always included.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
          {
            name: "locationId",
            in: "query",
            required: false,
            schema: { type: "integer" },
            description: "Optional location ID. When provided, the response excludes location-scoped courses that are not allowed at this location.",
          },
        ],
        responses: {
          "200": {
            description: "List of active online courses",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/OnlineCourse" } },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/online-course-checkout/start": {
      post: {
        tags: ["Online Courses"],
        summary: "Start online course checkout",
        description:
          "Creates an enrollment record for an online course and initiates payment. For Stripe/PayPal, returns a redirect URL to the payment provider. For Cash, returns enrollment and payment IDs immediately. Use externalSuccessUrl and externalCancelUrl to redirect students back to your website after payment.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OnlineCourseCheckoutRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Checkout initiated successfully",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      type: "object",
                      description: "Stripe/PayPal response",
                      required: ["redirectUrl", "enrollmentId", "paymentId"],
                      properties: {
                        redirectUrl: { type: "string", description: "Redirect the student's browser to this URL", example: "https://checkout.stripe.com/c/pay/cs_live_..." },
                        enrollmentId: { type: "integer", example: 42 },
                        paymentId: { type: "integer", example: 15 },
                      },
                    },
                    {
                      type: "object",
                      description: "Cash payment response",
                      required: ["cashPayment", "enrollmentId", "paymentId"],
                      properties: {
                        cashPayment: { type: "boolean", enum: [true], example: true },
                        enrollmentId: { type: "integer", example: 42 },
                        paymentId: { type: "integer", example: 15 },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": { description: "Invalid data, invalid course, or payment not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/sessions": {
      get: {
        tags: ["Schedule"],
        summary: "Get upcoming sessions",
        description:
          "Returns available upcoming sessions. By default only returns sessions from today onwards with status SCHEDULED. Use query parameters to filter by type, location, and date range.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
          { name: "type", in: "query", required: false, description: "Filter by session type", schema: { type: "string", enum: ["CLASSROOM", "DRIVE"] } },
          { name: "locationId", in: "query", required: false, description: "Filter by location ID", schema: { type: "integer" } },
          { name: "from", in: "query", required: false, description: "Start date (ISO 8601). Defaults to today.", schema: { type: "string", format: "date" }, example: "2025-06-01" },
          { name: "to", in: "query", required: false, description: "End date (ISO 8601)", schema: { type: "string", format: "date" }, example: "2025-07-01" },
        ],
        responses: {
          "200": {
            description: "List of upcoming sessions",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Session" },
                },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/instructors": {
      get: {
        tags: ["Schedule"],
        summary: "Get active instructors",
        description: "Returns all active instructors at the school.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        responses: {
          "200": {
            description: "List of active instructors",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Instructor" },
                },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/payment-methods": {
      get: {
        tags: ["School Data"],
        summary: "Get accepted payment methods",
        description: "Returns which payment methods the school accepts (Stripe, PayPal, Cash). Includes the Stripe publishable key and PayPal client ID needed for client-side integration.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        responses: {
          "200": {
            description: "Payment methods configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    stripe: {
                      type: "object",
                      nullable: true,
                      properties: {
                        publishableKey: { type: "string", example: "pk_live_..." },
                      },
                    },
                    paypal: {
                      type: "object",
                      nullable: true,
                      properties: {
                        clientId: { type: "string", example: "AclientId..." },
                        mode: { type: "string", enum: ["sandbox", "production"], example: "production" },
                      },
                    },
                    cash: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/cart": {
      post: {
        tags: ["Cart"],
        summary: "Create a new cart",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cart created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, tenantId: { type: "integer" }, status: { type: "string" } } } } } } },
      },
    },
    "/api/public/cart/{cartId}": {
      get: {
        tags: ["Cart"],
        summary: "Get cart with items and totals",
        parameters: [{ name: "cartId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cart with items", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
    "/api/public/cart/{cartId}/items": {
      post: {
        tags: ["Cart"],
        summary: "Add a package (and optional offering) to the cart",
        parameters: [{ name: "cartId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["packageId"], properties: { packageId: { type: "integer" }, offeringId: { type: "integer", nullable: true } } } } } },
        responses: { "200": { description: "Item added" }, "400": { description: "Invalid item" } },
      },
      delete: {
        tags: ["Cart"],
        summary: "Clear all items in cart",
        parameters: [{ name: "cartId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cart cleared" } },
      },
    },
    "/api/public/cart/{cartId}/items/{itemId}": {
      delete: {
        tags: ["Cart"],
        summary: "Remove a single cart item",
        parameters: [
          { name: "cartId", in: "path", required: true, schema: { type: "string" } },
          { name: "itemId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Item removed" } },
      },
    },
    "/api/public/tenant/{slug}/packages/{pkgId}/offerings": {
      get: {
        tags: ["Cart"],
        summary: "List published offerings that fulfill a package",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "pkgId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Offerings with remaining seats", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } } },
      },
    },
    "/api/public/tenant/{slug}/add-ons": {
      get: {
        tags: ["Cart"],
        summary: "List active add-on / upsell packages (catalog-level)",
        description: "Returns active packages flagged `availableAsUpsell=true` OR legacy `isAddOn=true`. This is the catalog-level list — use `/cart/{cartId}/upsells` instead at checkout if you want the cart-aware filtered list (server-side parent-dependency filtering).\n\nPass `locationId` to restrict to add-ons available at a specific location — school-wide add-ons (locationScopeMode = ALL_LOCATIONS) are always included.\n\nPass `parentPackageId` to restrict to add-ons whose `upsellParentPackageIds` includes that parent (or that have no dependency rows configured). Useful when previewing upsells for a single planned purchase before a cart exists.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          {
            name: "locationId",
            in: "query",
            required: false,
            schema: { type: "integer" },
            description: "Optional location ID. When provided, the response excludes location-scoped add-ons that are not allowed at this location.",
          },
          {
            name: "parentPackageId",
            in: "query",
            required: false,
            schema: { type: "integer" },
            description: "Optional parent package ID. When provided, the response only includes upsells whose `upsellParentPackageIds` contains this id, plus any upsell with no dependency rows (legacy generic add-on behavior).",
          },
        ],
        responses: {
          "200": {
            description: "Add-on / upsell packages",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Package" } } } },
          },
          "400": { description: "Invalid locationId or parentPackageId", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "School not found" },
        },
      },
    },
    "/api/public/cart/{cartId}/upsells": {
      get: {
        tags: ["Cart"],
        summary: "List upsell packages eligible for the current cart",
        description: "Cart-aware upsell list. Returns packages with `availableAsUpsell=true` that are NOT already in the cart, with the parent-package dependency rules (`upsellParentPackageIds`) applied server-side: an upsell row only appears if at least one of its declared parent packages is already in the cart, OR it has no dependency rows configured.\n\nThis is the endpoint you should call at checkout to render the upsell strip — it returns exactly what is allowed to be added next, given the cart's current contents.",
        parameters: [{ name: "cartId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Eligible upsells for this cart",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Package" } } } },
          },
          "404": { description: "Cart not found" },
        },
      },
    },
    "/api/public/tenant/{slug}/packages/{pkgId}": {
      get: {
        tags: ["School Data"],
        summary: "Get a single package by id (with related upsells)",
        description: "Returns one active, standalone-sellable package, including derived `requiresCohortSelection`, `upsellParentPackageIds`, `channels`, and a `relatedUpsells` array of upsell packages eligible alongside this one. Pass `locationId` to also gate by the buyer's selected location — packages and upsells not available at that location are hidden.\n\nUseful for product-detail pages where you want one round-trip per package view.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "pkgId", in: "path", required: true, schema: { type: "integer" } },
          {
            name: "locationId",
            in: "query",
            required: false,
            schema: { type: "integer" },
            description: "Optional location ID. When provided, the package is rejected with 404 if not allowed at this location, and `relatedUpsells` is filtered the same way.",
          },
        ],
        responses: {
          "200": {
            description: "Package with related upsells",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Package" },
                    {
                      type: "object",
                      properties: {
                        relatedUpsells: { type: "array", items: { $ref: "#/components/schemas/Package" } },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": { description: "Invalid package id or locationId" },
          "404": { description: "Package not found, inactive, upsell-only, or not available at this location" },
        },
      },
    },
    "/api/public/cart/{cartId}/enrollments": {
      get: {
        tags: ["Cart"],
        summary: "List enrollments created from a cart",
        description: "After a cart-checkout succeeds, returns one enrollment per cart line item. Safe to poll from a thank-you page to confirm activation. Sensitive fields are stripped — only the data needed to render a confirmation list is returned.",
        parameters: [{ name: "cartId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Cart enrollments",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      firstName: { type: "string" },
                      lastName: { type: "string" },
                      status: { type: "string", enum: ["pending", "pending_payment", "confirmed", "in_progress", "completed", "refunded", "expired"] },
                      isWaitlisted: { type: "boolean" },
                      offeringId: { type: "integer", nullable: true },
                      priceSnapshotCents: { type: "integer" },
                      packageSnapshotJson: { type: "object", nullable: true },
                    },
                  },
                },
              },
            },
          },
          "404": { description: "Cart not found" },
        },
      },
    },
    "/api/public/cart/{cartId}/receipt": {
      get: {
        tags: ["Cart"],
        summary: "Get a printable receipt for a cart purchase",
        description: "Returns a unified receipt payload covering the whole cart: line items, totals, payment method + transaction reference, customer (student + parent) snapshot, and school info. Used by the thank-you/print-receipt page for cart flows. Returns `kind=\"cart\"`.",
        parameters: [{ name: "cartId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Cart receipt",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Receipt" } } },
          },
          "404": { description: "Cart not found" },
        },
      },
    },
    "/api/public/enrollments/{id}/receipt": {
      get: {
        tags: ["Enrollment"],
        summary: "Get a printable receipt for a single enrollment",
        description: "Returns the same unified receipt shape as `/cart/{cartId}/receipt`, but for the legacy single-package checkout flow (one enrollment, one payment). Returns `kind=\"enrollment\"`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            description: "Enrollment receipt",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Receipt" } } },
          },
          "400": { description: "Invalid enrollment id" },
          "404": { description: "Enrollment not found" },
        },
      },
    },
    "/api/public/tenant/{slug}/cart-checkout/headless": {
      post: {
        tags: ["Cart"],
        summary: "Build a cart and start checkout in a single API call",
        description: "Headless one-shot variant of /cart-checkout/start. Server creates a cart, populates it from the items array (each {packageId, offeringId?}), then starts the single-payment checkout. Returns the same response shape as /cart-checkout/start (redirectUrl for STRIPE/PAYPAL, cashPayment+cartId+paymentId for CASH). Use externalSuccessUrl/externalCancelUrl to route the buyer back to your embedded site.",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["provider", "student", "items"], properties: {
          provider: { type: "string", enum: ["STRIPE", "PAYPAL", "CASH"] },
          items: { type: "array", minItems: 1, items: { type: "object", required: ["packageId"], properties: {
            packageId: { type: "integer" },
            offeringId: { type: "integer", nullable: true, description: "Required when the package has an IN_CLASS component." },
          } } },
          student: { type: "object", required: ["firstName", "lastName", "email"], properties: {
            firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, dateOfBirth: { type: "string" },
            parentName: { type: "string" }, parentEmail: { type: "string" }, parentPhone: { type: "string" },
          } },
          locationId: { type: "integer", nullable: true },
          externalSuccessUrl: { type: "string", format: "uri" },
          externalCancelUrl: { type: "string", format: "uri" },
          studentSignature: { type: "string" },
          receiverSignature: { type: "string" },
          receiverName: { type: "string" },
        } } } } },
        responses: {
          "200": { description: "Checkout started", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "Cart build failed (missing offering for IN_CLASS, invalid package, etc.) or payment misconfigured" },
        },
      },
    },
    "/api/public/tenant/{slug}/cart-checkout/start": {
      post: {
        tags: ["Cart"],
        summary: "Convert a cart into enrollments and start a single payment",
        description: "Creates one enrollment per cart item (linked by cartId) and a single payment for the full cart total. On capture/webhook, every enrollment is activated; for items with an offeringId the student is auto-booked into all sessions atomically, falling back to the offering waitlist if any session is full. Use externalSuccessUrl and externalCancelUrl to redirect students back to your embedded site after payment; the cart UUID is appended as ?cart=<id>.",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["provider", "cartId", "student"], properties: {
          provider: { type: "string", enum: ["STRIPE", "PAYPAL", "CASH"] },
          cartId: { type: "string" },
          student: { type: "object", required: ["firstName", "lastName", "email"], properties: {
            firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, dateOfBirth: { type: "string" },
            parentName: { type: "string" }, parentEmail: { type: "string" }, parentPhone: { type: "string" },
          } },
          locationId: { type: "integer", nullable: true },
          externalSuccessUrl: { type: "string", format: "uri", description: "Redirect URL after successful payment. Cart UUID appended as ?cart=<id>." },
          externalCancelUrl: { type: "string", format: "uri", description: "Redirect URL if the buyer cancels checkout." },
          studentSignature: { type: "string" },
          receiverSignature: { type: "string" },
          receiverName: { type: "string" },
        } } } } },
        responses: {
          "200": { description: "Checkout started — redirect or cash response", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "Cart empty / invalid / payment misconfigured" },
        },
      },
    },
    "/api/public/tenant/{slug}/checkout/start": {
      post: {
        tags: ["Enrollment"],
        summary: "Start enrollment checkout",
        description:
          "Creates an enrollment record and initiates payment. For Stripe/PayPal, returns a redirect URL to the payment provider. For Cash, returns enrollment and payment IDs immediately. Use externalSuccessUrl and externalCancelUrl to redirect students back to your website after payment.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CheckoutStartRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Checkout initiated successfully",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      type: "object",
                      description: "Stripe/PayPal response",
                      required: ["redirectUrl", "enrollmentId", "paymentId"],
                      properties: {
                        redirectUrl: { type: "string", description: "Redirect the student's browser to this URL", example: "https://checkout.stripe.com/c/pay/cs_live_..." },
                        enrollmentId: { type: "integer", example: 42 },
                        paymentId: { type: "integer", example: 15 },
                      },
                    },
                    {
                      type: "object",
                      description: "Cash payment response",
                      required: ["cashPayment", "enrollmentId", "paymentId"],
                      properties: {
                        cashPayment: { type: "boolean", enum: [true], example: true },
                        enrollmentId: { type: "integer", example: 42 },
                        paymentId: { type: "integer", example: 15 },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": { description: "Invalid data or payment not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/enrollments/{id}/status": {
      get: {
        tags: ["Enrollment"],
        summary: "Check enrollment status",
        description:
          "Returns the current status of an enrollment, including payment info. Use this after the student returns from payment to verify their enrollment was activated.",
        parameters: [
          { name: "id", in: "path", required: true, description: "Enrollment ID", schema: { type: "integer" }, example: 42 },
        ],
        responses: {
          "200": {
            description: "Enrollment status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "integer", example: 42 },
                    status: { type: "string", enum: ["pending", "pending_payment", "confirmed", "in_progress", "completed", "refunded", "expired"], example: "confirmed" },
                    firstName: { type: "string", example: "Jane" },
                    lastName: { type: "string", example: "Smith" },
                    packageSnapshot: { type: "object", description: "Package details at time of enrollment" },
                    priceSnapshotCents: { type: "integer", example: 29900 },
                    activatedAt: { type: "string", format: "date-time", nullable: true },
                    payment: {
                      type: "object",
                      nullable: true,
                      properties: {
                        provider: { type: "string", enum: ["STRIPE", "PAYPAL", "CASH"] },
                        status: { type: "string", enum: ["CREATED", "PENDING", "COMPLETED", "FAILED", "REFUNDED"] },
                        amountCents: { type: "integer", example: 29900 },
                        currency: { type: "string", example: "USD" },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { description: "Enrollment not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/contact": {
      post: {
        tags: ["Contact"],
        summary: "Submit contact form",
        description:
          "Submits a contact form inquiry to the school. The school admin will see the submission in their admin dashboard.\n\n**Storefront integration guide.** External sites that build their own contact form against this endpoint should add three lightweight anti-spam protections so we don't burn through email quota on bot traffic:\n\n1. **Honeypot** — render a hidden `website` text input that real users will not fill in. Any submission that includes a non-empty value is silently accepted (204) and discarded.\n2. **Time-on-form** — record `Date.now()` when the form mounts and send `elapsedMs` (the difference at submit time) in the request body. Submissions faster than ~3 seconds are silently dropped with a 204.\n3. **Per-IP rate limit** — the API will return 429 after 5 submissions from the same IP within a 10-minute window. Surface a friendly \"please try again later\" message to the user when this happens.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ContactRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Contact form submitted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "integer", example: 5 },
                    tenantId: { type: "integer", example: 1 },
                    name: { type: "string", example: "Jane Smith" },
                    email: { type: "string", example: "jane@example.com" },
                    phone: { type: "string", nullable: true, example: "555-123-4567" },
                    message: { type: "string", example: "I'd like to enroll my teen in driving classes." },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "204": {
            description:
              "Submission silently discarded by anti-spam protections (honeypot tripped or submitted faster than the minimum elapsed time). The response body is empty so bots can't differentiate it from a successful submission.",
          },
          "400": { description: "Invalid data", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Too many submissions from this IP. Try again later.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/tenant/{slug}/announcement": {
      get: {
        tags: ["Announcements"],
        summary: "Get the active storefront announcement",
        description:
          "Returns the school's active announcement banner if one is currently published and inside its validity window. Returns `{ announcement: null }` when nothing is live so external sites can simply render the response without extra checks.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "sunshine-driving" },
        ],
        responses: {
          "200": {
            description: "Active announcement (or null when none is live)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    announcement: {
                      nullable: true,
                      allOf: [{ $ref: "#/components/schemas/Announcement" }],
                    },
                  },
                },
              },
            },
          },
          "404": { description: "School not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/tenants/{tenantId}/announcement": {
      get: {
        tags: ["Announcements"],
        summary: "Get the currently live announcement (admin)",
        description: "Returns the announcement that would currently be shown on the storefront, or `null` if nothing is live. Session-cookie auth (admin dashboard) — not available with API key.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "The live announcement, or null",
            content: {
              "application/json": {
                schema: { nullable: true, allOf: [{ $ref: "#/components/schemas/Announcement" }] },
              },
            },
          },
          "401": { description: "Not authenticated" },
        },
      },
    },
    "/api/tenants/{tenantId}/announcements": {
      get: {
        tags: ["Announcements"],
        summary: "List all saved announcements (admin)",
        description: "Returns every announcement saved for the school, plus a `live` field indicating which one (if any) is currently being shown. Session-cookie auth.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "List of announcements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Announcement" } },
                    live: { nullable: true, allOf: [{ $ref: "#/components/schemas/Announcement" }] },
                  },
                },
              },
            },
          },
          "401": { description: "Not authenticated" },
        },
      },
      post: {
        tags: ["Announcements"],
        summary: "Create an announcement (admin)",
        description: "Creates a new announcement banner for the school. Session-cookie auth.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AnnouncementInput" } } },
        },
        responses: {
          "201": {
            description: "Announcement created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Announcement" } } },
          },
          "400": { description: "Invalid data", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Not authenticated" },
        },
      },
    },
    "/api/tenants/{tenantId}/announcements/{id}": {
      patch: {
        tags: ["Announcements"],
        summary: "Update an announcement (admin)",
        description: "Partially updates an existing announcement (e.g. enable/disable, edit message, change CTA, adjust validity window or styling). Session-cookie auth.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AnnouncementInput" } } },
        },
        responses: {
          "200": {
            description: "Announcement updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Announcement" } } },
          },
          "400": { description: "Invalid data", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Not authenticated" },
          "404": { description: "Announcement not found" },
        },
      },
      delete: {
        tags: ["Announcements"],
        summary: "Delete an announcement (admin)",
        description: "Permanently deletes an announcement. Session-cookie auth.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "204": { description: "Announcement deleted" },
          "401": { description: "Not authenticated" },
          "404": { description: "Announcement not found" },
        },
      },
    },
    "/api/public/resolve": {
      get: {
        tags: ["Resolution"],
        summary: "Resolve hostname to tenant",
        description: "Resolves a custom domain hostname to a tenant slug and ID. Useful for custom domain setups. **No API key required.**",
        security: [],
        parameters: [
          { name: "hostname", in: "query", required: true, description: "The hostname to resolve", schema: { type: "string" }, example: "www.sunshinedrivingschool.com" },
        ],
        responses: {
          "200": {
            description: "Tenant resolved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    slug: { type: "string", example: "sunshine-driving" },
                    tenantId: { type: "integer", example: 1 },
                    name: { type: "string", example: "Sunshine Driving School" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing hostname parameter", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "No school found for this hostname", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/tenants/{tenantId}/enrollments/{id}/components": {
      get: {
        tags: ["Office Scheduling"],
        summary: "Get outstanding package components for an enrollment",
        description: "Returns required/booked/attended/remaining hours per component type, plus the in-class gate flag. The gate is bypassed when the package contains no IN_CLASS component.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Enrollment ID" },
        ],
        responses: {
          "200": {
            description: "Outstanding components",
            content: { "application/json": { schema: {
              type: "object",
              properties: {
                components: { type: "array", items: { type: "object", properties: {
                  type: { type: "string", enum: ["IN_CLASS", "ONLINE_PERMIT", "STUDY_GUIDE", "BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"] },
                  label: { type: "string", nullable: true },
                  requiredHours: { type: "integer" },
                  bookedHours: { type: "integer" },
                  attendedHours: { type: "integer" },
                  remainingHours: { type: "integer" },
                } } },
                inClassFromThisSchool: { type: "boolean" },
                inClassRequired: { type: "integer" },
                inClassAttended: { type: "integer" },
                inClassGate: { type: "boolean", description: "True when BTW/Road-Test booking must be blocked." },
              },
            } } },
          },
          "403": { description: "Forbidden — not a tenant member" },
        },
      },
    },
    "/api/tenants/{tenantId}/enrollments/{id}/btw-sessions": {
      post: {
        tags: ["Office Scheduling"],
        summary: "Create a BTW or Road-Test session for an enrollment",
        description: "Office creates an instructor-paired single-student BTW or Road-Test session. Performs in-class gate check, instructor/vehicle conflict check, and atomically creates the session, the booking, and a DRIVE credit ledger entry.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Enrollment ID" },
        ],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object",
          required: ["componentType", "instructorId", "startAt", "endAt"],
          properties: {
            componentType: { type: "string", enum: ["BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"] },
            instructorId: { type: "string" },
            vehicleId: { type: "integer", nullable: true },
            locationId: { type: "integer", nullable: true },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
            notes: { type: "string", nullable: true },
          },
        } } } },
        responses: {
          "200": { description: "Session created", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, session: { type: "object" }, booking: { type: "object" } } } } } },
          "400": { description: "Validation error or no remaining component hours" },
          "409": {
            description: "In-class gate active — student must complete in-class hours bought from this school first.",
            content: { "application/json": { schema: {
              type: "object",
              properties: {
                ok: { type: "boolean", example: false },
                gate: { type: "boolean", example: true },
                reason: { type: "string", example: "In-class component must be completed at this school before BTW or Road Test sessions can be booked." },
              },
            } } },
          },
          "403": { description: "Forbidden — requires tenant_admin / office_manager / platform_admin" },
        },
      },
    },
    "/api/tenants/{tenantId}/instructors/{id}/slots": {
      get: {
        tags: ["Office Scheduling"],
        summary: "List instructor availability windows and busy times",
        description: "Returns recurring availability windows derived from `instructor_availability` and busy intervals from existing non-cancelled sessions. When `vehicleId` is supplied, busy intervals also include sessions booked on that vehicle (with a different instructor).",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Instructor user ID" },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "vehicleId", in: "query", schema: { type: "integer" }, description: "Optional vehicle to additionally check for conflicts." },
        ],
        responses: {
          "200": { description: "Availability and busy intervals", content: { "application/json": { schema: {
            type: "object",
            properties: {
              windows: { type: "array", items: { type: "object", properties: { startAt: { type: "string", format: "date-time" }, endAt: { type: "string", format: "date-time" } } } },
              busy: { type: "array", items: { type: "object", properties: { source: { type: "string", enum: ["instructor", "vehicle"] }, startAt: { type: "string", format: "date-time" }, endAt: { type: "string", format: "date-time" } } } },
            },
          } } } },
        },
      },
    },
    "/api/tenants/{tenantId}/sessions/{id}/cancel-and-reschedule": {
      post: {
        tags: ["Office Scheduling"],
        summary: "Cancel a session and create a replacement, moving its bookings",
        description: "Atomically cancels session `:id`, creates a new session at the new time/instructor/vehicle, moves all active bookings, adjusts credit ledger if duration changed, sends emails to affected students (or logs `skipped_no_provider` when RESEND_API_KEY is not configured), and writes activity log entries on both the original and new sessions.",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object",
          required: ["newStartAt", "newEndAt"],
          properties: {
            newStartAt: { type: "string", format: "date-time" },
            newEndAt: { type: "string", format: "date-time" },
            newInstructorId: { type: "string", nullable: true },
            newLocationId: { type: "integer", nullable: true },
            newVehicleId: { type: "integer", nullable: true },
            emailSubject: { type: "string", nullable: true },
            emailBody: { type: "string", nullable: true },
          },
        } } } },
        responses: {
          "200": { description: "Rescheduled", content: { "application/json": { schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              originalSession: { type: "object" },
              newSession: { type: "object" },
              movedBookings: { type: "array", items: { type: "object" } },
              emails: { type: "array", items: { type: "object", properties: { to: { type: "string" }, status: { type: "string", enum: ["sent", "skipped_no_provider", "failed"] } } } },
            },
          } } } },
          "400": { description: "Validation error or instructor/vehicle conflict at new time" },
          "403": { description: "Forbidden" },
        },
      },
    },
    "/api/tenants/{tenantId}/sessions/{id}/activity": {
      get: {
        tags: ["Office Scheduling"],
        summary: "Get the activity log and email log for a session",
        parameters: [
          { name: "tenantId", in: "path", required: true, schema: { type: "integer" } },
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Activity and email entries", content: { "application/json": { schema: {
            type: "object",
            properties: {
              activity: { type: "array", items: { type: "object", properties: {
                id: { type: "integer" },
                action: { type: "string", enum: ["created", "cancelled", "rescheduled", "email_sent", "email_failed", "email_skipped", "booking_moved", "btw_scheduled"] },
                actorUserId: { type: "string", nullable: true },
                message: { type: "string" },
                payload: { type: "object" },
                createdAt: { type: "string", format: "date-time" },
              } } },
              emails: { type: "array", items: { type: "object", properties: {
                id: { type: "integer" },
                recipientEmail: { type: "string" },
                subject: { type: "string" },
                status: { type: "string", enum: ["queued", "sent", "skipped_no_provider", "failed"] },
                errorMsg: { type: "string", nullable: true },
                createdAt: { type: "string", format: "date-time" },
                sentAt: { type: "string", format: "date-time", nullable: true },
              } } },
            },
          } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        properties: {
          message: { type: "string", example: "School not found" },
          code: {
            type: "string",
            description:
              "Stable machine-readable error code returned by the public cart and checkout endpoints (POST /cart/{cartId}/items, POST /checkout/start, POST /cart-checkout/start, POST /cart-checkout/headless). Headless integrators should branch on `code` rather than the human-readable `message`. See the API docs page for the full list.",
            enum: [
              "INVALID_DATA",
              "INVALID_PACKAGE",
              "INVALID_LOCATION",
              "PACKAGE_INACTIVE",
              "COHORT_SELECTION_REQUIRED",
              "OFFERING_NOT_FOUND",
              "OFFERING_NOT_BOOKABLE",
              "OFFERING_PACKAGE_MISMATCH",
              "PACKAGE_NOT_STANDALONE",
              "PACKAGE_NOT_AVAILABLE",
              "UPSELL_PARENT_MISSING",
              "LOCATION_REQUIRED",
              "LOCATION_NOT_ALLOWED",
              "CART_LOCATION_MISMATCH",
              "CART_NOT_FOUND",
              "CART_NOT_EDITABLE",
              "CART_EMPTY",
              "CART_ALREADY_PROCESSED",
              "CART_ID_REQUIRED",
              "PAYMENT_PROVIDER_NOT_CONFIGURED",
            ],
            example: "COHORT_SELECTION_REQUIRED",
          },
          details: {
            type: "object",
            description: "Optional structured context (e.g. Zod field errors, provider name). Shape depends on `code`.",
            additionalProperties: true,
          },
        },
      },
      Package: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Teen Driver Education" },
          description: { type: "string", nullable: true, example: "Complete 32-hour classroom + 14-hour behind-the-wheel course" },
          price: { type: "integer", description: "Price in cents (e.g., 29900 = $299.00)", example: 29900 },
          imageUrl: { type: "string", nullable: true, example: "https://cdn.example.com/teen-package.jpg" },
          features: {
            type: "array",
            items: { type: "string" },
            description: "Marketing bullet points to display on the package card.",
            example: ["32 hours classroom", "14 hours behind-the-wheel", "TDLR-approved curriculum"],
          },
          sortOrder: { type: "integer", example: 0 },
          classroomHoursRequired: { type: "integer", nullable: true, example: 32 },
          driveHoursRequired: { type: "integer", nullable: true, example: 14 },
          creditClassroom: { type: "integer", nullable: true, description: "Number of CLASSROOM credits granted to the student on activation. Used to gate session bookings.", example: 32 },
          creditDrive: { type: "integer", nullable: true, description: "Number of DRIVE credits granted to the student on activation. Used to gate BTW/road-test bookings.", example: 14 },
          ageRestriction: { type: "string", nullable: true, example: "14-17", description: "Free-form display label kept for back-compatibility. Use `ageMin`/`ageMax` for hard gating." },
          ageMin: { type: "integer", nullable: true, description: "Hard minimum age (inclusive). Used to gate single-package checkout.", example: 14 },
          ageMax: { type: "integer", nullable: true, description: "Hard maximum age (inclusive). Used to gate single-package checkout.", example: 17 },
          audience: {
            type: "string",
            enum: ["TEENS", "ADULTS", "BOTH"],
            description: "Marketing/admin label for the intended audience. Independent of the hard `ageMin`/`ageMax` gating — useful for grouping or filtering on the storefront. Defaults to `BOTH`.",
            example: "TEENS",
          },
          kind: {
            type: "string",
            enum: ["COHORT_BASED", "SIMPLE"],
            description: "`COHORT_BASED` packages need a class schedule (cohort/offering) before checkout. `SIMPLE` packages (e.g. Road Test, School Car) have no class schedule and skip the cohort-pick flow.",
            example: "COHORT_BASED",
          },
          requiresCohortSelection: {
            type: "boolean",
            description: "Convenience mirror of `kind === \"COHORT_BASED\"`. When `true`, integrators must collect an `offeringId` from `/packages/{pkgId}/offerings` before adding to cart or starting single-package checkout.",
            example: true,
          },
          active: { type: "boolean", example: true },
          isAddOn: { type: "boolean", description: "Legacy add-on flag. Prefer `availableAsUpsell` and `sellableStandalone` for new integrations.", example: false },
          locationScopeMode: {
            type: "string",
            enum: ["ALL_LOCATIONS", "SPECIFIC_LOCATIONS"],
            description: "Whether the package is offered at every location or only at specific locations. Pass a `locationId` query parameter to filter the response by what is available at a given location.",
            example: "ALL_LOCATIONS",
          },
          sellableStandalone: {
            type: "boolean",
            description: "Source of truth for the `catalog` channel. When `true`, the package can be purchased on its own and appears in the public packages list and single-package checkout. When `false`, the package is upsell-only — single-package checkout will reject it (`PACKAGE_NOT_STANDALONE`).",
            example: true,
          },
          availableAsUpsell: {
            type: "boolean",
            description: "Source of truth for the `upsell` channel. When `true`, the package can be offered as an upsell inside the cart upsells list (subject to any parent-package dependency rules in `upsellParentPackageIds`).",
            example: false,
          },
          upsellParentPackageIds: {
            type: "array",
            items: { type: "integer" },
            description: "When non-empty, this package only becomes eligible as an upsell once one of these parent package ids is already in the cart (e.g. School Car only shows when Road Test is in the cart). When empty, the upsell falls back to the legacy generic add-on behavior (eligible whenever the cart is non-empty).",
            example: [3],
          },
          channels: {
            type: "array",
            items: { type: "string", enum: ["catalog", "upsell"] },
            description: "Derived convenience projection of where this package is allowed to appear. Mapping: `sellableStandalone=true` adds `\"catalog\"`; `availableAsUpsell=true` adds `\"upsell\"`. A package with both flags off returns `[]` (and continues to be hidden from the catalog). The underlying `sellableStandalone` and `availableAsUpsell` booleans remain authoritative — `channels` is provided so simple integrators can render the right UI without combining the two flags themselves.",
            example: ["catalog"],
          },
        },
      },
      Receipt: {
        type: "object",
        description: "Unified receipt payload returned by both `/cart/{cartId}/receipt` and `/enrollments/{id}/receipt`. The `kind` field tells you which flow produced it.",
        properties: {
          kind: { type: "string", enum: ["cart", "enrollment"], example: "cart" },
          reference: { type: "string", description: "Human-friendly reference: cart UUID for `kind=cart`, enrollment id for `kind=enrollment`.", example: "8f1c8a4e-5b6e-4f25-9b9d-0d6c5b9b3a3a" },
          createdAt: { type: "string", format: "date-time", nullable: true },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer", description: "Enrollment id for this line." },
                firstName: { type: "string" },
                lastName: { type: "string" },
                status: { type: "string", enum: ["pending", "pending_payment", "confirmed", "in_progress", "completed", "refunded", "expired"] },
                isWaitlisted: { type: "boolean" },
                offeringId: { type: "integer", nullable: true },
                priceCents: { type: "integer", example: 29900 },
                package: { type: "object", nullable: true, description: "Package snapshot taken at enrollment time." },
              },
            },
          },
          totals: {
            type: "object",
            properties: {
              subtotalCents: { type: "integer", example: 29900 },
              totalCents: { type: "integer", example: 29900 },
              currency: { type: "string", example: "USD" },
            },
          },
          payment: {
            type: "object",
            nullable: true,
            properties: {
              provider: { type: "string", enum: ["STRIPE", "PAYPAL", "CASH"] },
              status: { type: "string", enum: ["CREATED", "PENDING", "SUCCEEDED", "COMPLETED", "FAILED", "REFUNDED"] },
              amountCents: { type: "integer" },
              currency: { type: "string", example: "USD" },
              reference: { type: "string", nullable: true, description: "Provider transaction id (Stripe payment intent / PayPal order id) when available." },
            },
          },
          customer: {
            type: "object",
            properties: {
              student: {
                type: "object",
                properties: {
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  email: { type: "string" },
                  phone: { type: "string" },
                  dateOfBirth: { type: "string" },
                },
              },
              parent: {
                type: "object",
                nullable: true,
                description: "Parent/guardian block. `null` for adult students.",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" },
                  phone: { type: "string" },
                },
              },
            },
          },
          school: {
            type: "object",
            nullable: true,
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              slug: { type: "string" },
              logoUrl: { type: "string", nullable: true },
            },
          },
        },
      },
      Location: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Main Campus" },
          address: { type: "string", nullable: true, example: "123 Main Street" },
          city: { type: "string", nullable: true, example: "Austin" },
          state: { type: "string", nullable: true, example: "TX" },
          zip: { type: "string", nullable: true, example: "78701" },
          phone: { type: "string", nullable: true, example: "(512) 555-0100" },
          email: { type: "string", nullable: true, example: "main@sunshinedrivingschool.com" },
        },
      },
      Session: {
        type: "object",
        properties: {
          id: { type: "integer", example: 10 },
          type: { type: "string", enum: ["CLASSROOM", "DRIVE"], example: "CLASSROOM" },
          startAt: { type: "string", format: "date-time", example: "2025-06-15T09:00:00.000Z" },
          endAt: { type: "string", format: "date-time", example: "2025-06-15T11:00:00.000Z" },
          locationId: { type: "integer", nullable: true, example: 1 },
          capacity: { type: "integer", example: 30 },
          bookedCount: { type: "integer", example: 12 },
          availableSpots: { type: "integer", example: 18 },
          instructorName: { type: "string", nullable: true, example: "John Miller" },
        },
      },
      Instructor: {
        type: "object",
        properties: {
          id: { type: "string", example: "usr_abc123" },
          firstName: { type: "string", nullable: true, example: "John" },
          lastName: { type: "string", nullable: true, example: "Miller" },
          profileImageUrl: { type: "string", nullable: true, example: "https://example.com/photo.jpg" },
          instructorType: { type: "string", nullable: true, enum: ["CLASSROOM", "DRIVE", "BOTH"], example: "BOTH" },
        },
      },
      OnlineCourse: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Texas Adult Driver Education Online" },
          description: { type: "string", nullable: true, example: "Complete your adult driver education course online at your own pace." },
          price: { type: "integer", description: "Price in cents (e.g., 4900 = $49.00)", example: 4900 },
          providerName: { type: "string", nullable: true, example: "MyImprov", description: "Name of the third-party course provider" },
          providerUrl: { type: "string", nullable: true, example: "https://www.myimprov.com", description: "URL of the provider's website" },
          imageUrl: { type: "string", nullable: true, example: "https://example.com/course-image.jpg" },
          active: { type: "boolean", example: true },
          sortOrder: { type: "integer", example: 0 },
          locationScopeMode: {
            type: "string",
            enum: ["ALL_LOCATIONS", "SPECIFIC_LOCATIONS"],
            example: "ALL_LOCATIONS",
            description: "Whether this course is offered school-wide (ALL_LOCATIONS) or only at specific locations (SPECIFIC_LOCATIONS).",
          },
        },
      },
      Promotion: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          headline: { type: "string", example: "Spring Enrollment Special" },
          description: { type: "string", example: "Save 20% on all teen driving packages when you enroll this spring." },
          badgeText: { type: "string", example: "20% OFF", description: "Short text displayed as a badge/tag on the promotion" },
          icon: { type: "string", enum: ["tag", "zap", "gift", "star", "percent"], example: "percent", description: "Icon identifier for visual display" },
          ctaLabel: { type: "string", example: "Enroll Now", description: "Call-to-action button label" },
          locationId: { type: "integer", nullable: true, example: 1, description: "Location this promotion applies to, or null for school-wide" },
          packageId: { type: "integer", nullable: true, example: 3, description: "Linked package ID, or null if not linked to a specific package" },
          validFrom: { type: "string", format: "date-time", nullable: true, example: "2025-03-01T00:00:00.000Z" },
          validUntil: { type: "string", format: "date-time", nullable: true, example: "2025-06-30T23:59:59.000Z" },
          active: { type: "boolean", example: true },
          sortOrder: { type: "integer", example: 0 },
        },
      },
      Announcement: {
        type: "object",
        description: "A storefront announcement banner.",
        properties: {
          id: { type: "integer", example: 12 },
          tenantId: { type: "integer", example: 1 },
          title: { type: "string", nullable: true, example: "Spring promo" },
          enabled: { type: "boolean", example: true, description: "Whether the school has switched this banner on. The public endpoint also requires the validity window to be current." },
          message: { type: "string", example: "$50 off Teen packages booked this month!" },
          ctaLabel: { type: "string", nullable: true, example: "Enroll now" },
          ctaHref: { type: "string", nullable: true, example: "https://myschool.com/enroll" },
          phone: { type: "string", nullable: true, example: "555-123-4567" },
          bgColor: { type: "string", example: "#0f172a", description: "Hex color for the banner background." },
          textColor: { type: "string", example: "#ffffff", description: "Hex color for the banner text." },
          dismissable: { type: "boolean", example: true, description: "Whether visitors can close the banner." },
          priority: { type: "integer", example: 0, description: "Higher priority banners win when multiple are eligible at the same time." },
          validFrom: { type: "string", format: "date-time", nullable: true },
          validUntil: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AnnouncementInput: {
        type: "object",
        description: "Body for creating or updating an announcement. All fields are optional on PATCH; `message` is required on POST.",
        properties: {
          title: { type: "string", nullable: true, example: "Spring promo" },
          enabled: { type: "boolean", example: true },
          message: { type: "string", example: "$50 off Teen packages booked this month!" },
          ctaLabel: { type: "string", nullable: true, example: "Enroll now" },
          ctaHref: { type: "string", nullable: true, example: "https://myschool.com/enroll" },
          phone: { type: "string", nullable: true, example: "555-123-4567" },
          bgColor: { type: "string", example: "#0f172a" },
          textColor: { type: "string", example: "#ffffff" },
          dismissable: { type: "boolean", example: true },
          priority: { type: "integer", example: 0 },
          validFrom: { type: "string", format: "date-time", nullable: true },
          validUntil: { type: "string", format: "date-time", nullable: true },
        },
      },
      ContactRequest: {
        type: "object",
        required: ["name", "email", "message"],
        properties: {
          name: { type: "string", example: "Jane Smith", description: "Full name of the person submitting the form" },
          email: { type: "string", format: "email", example: "jane@example.com" },
          phone: { type: "string", example: "555-123-4567", description: "Optional phone number" },
          message: { type: "string", example: "I'd like to enroll my teen in driving classes. Can you send me more info?" },
          website: {
            type: "string",
            description:
              "Honeypot anti-spam field. Render a hidden input named `website` in your storefront contact form and DO NOT let humans fill it in (e.g. CSS `display:none` plus `tabindex=-1` and `autocomplete=off`). Submissions where this field has any value are silently discarded with a 204.",
            example: "",
          },
          elapsedMs: {
            type: "integer",
            description:
              "Optional milliseconds between when the contact form was rendered and when it was submitted. Submissions faster than ~3 seconds are silently discarded with a 204 (treated as bot traffic).",
            example: 12000,
          },
        },
      },
      CheckoutStartRequest: {
        type: "object",
        required: ["provider", "packageId", "student"],
        properties: {
          provider: { type: "string", enum: ["STRIPE", "PAYPAL", "CASH"], description: "Payment provider to use" },
          packageId: { type: "integer", description: "ID of the package to enroll in", example: 1 },
          locationId: { type: "integer", nullable: true, description: "Preferred location ID (optional)", example: 1 },
          student: {
            type: "object",
            required: ["firstName", "lastName", "email"],
            properties: {
              firstName: { type: "string", example: "Jane" },
              lastName: { type: "string", example: "Smith" },
              email: { type: "string", format: "email", example: "jane@example.com" },
              phone: { type: "string", example: "555-123-4567" },
              dateOfBirth: { type: "string", format: "date", example: "2008-03-15" },
              parentName: { type: "string", description: "Required if student is under 18" },
              parentEmail: { type: "string", format: "email", description: "Required if student is under 18" },
              parentPhone: { type: "string" },
            },
          },
          parent: {
            type: "object",
            description: "Parent/guardian info (required if student is under 18)",
            properties: {
              name: { type: "string" },
              email: { type: "string", format: "email" },
              phone: { type: "string" },
            },
          },
          externalSuccessUrl: {
            type: "string",
            format: "uri",
            description: "URL to redirect the student to after successful payment. Drivorata appends ?enrollment={id} automatically.",
            example: "https://myschool.com/thank-you",
          },
          externalCancelUrl: {
            type: "string",
            format: "uri",
            description: "URL to redirect the student to if they cancel payment.",
            example: "https://myschool.com/enroll",
          },
        },
      },
      OnlineCourseCheckoutRequest: {
        type: "object",
        required: ["provider", "onlineCourseId", "student"],
        properties: {
          provider: { type: "string", enum: ["STRIPE", "PAYPAL", "CASH"], description: "Payment provider to use" },
          onlineCourseId: { type: "integer", description: "ID of the online course to purchase", example: 1 },
          locationId: {
            type: "integer",
            description: "Optional location ID. Required when the course's locationScopeMode is SPECIFIC_LOCATIONS — must be one of the locations the course is available at.",
            example: 1,
          },
          student: {
            type: "object",
            required: ["firstName", "lastName", "email"],
            properties: {
              firstName: { type: "string", example: "Jane" },
              lastName: { type: "string", example: "Smith" },
              email: { type: "string", format: "email", example: "jane@example.com" },
              phone: { type: "string", example: "555-123-4567" },
            },
          },
          externalSuccessUrl: {
            type: "string",
            format: "uri",
            description: "URL to redirect the student to after successful payment.",
            example: "https://myschool.com/thank-you",
          },
          externalCancelUrl: {
            type: "string",
            format: "uri",
            description: "URL to redirect the student to if they cancel payment.",
            example: "https://myschool.com/courses",
          },
        },
      },
    },
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Use your API key as the bearer token: Authorization: Bearer drv_live_...",
      },
      ApiKeyHeader: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Pass your API key via the x-api-key header",
      },
    },
  },
  security: [
    { BearerAuth: [] },
    { ApiKeyHeader: [] },
  ],
};
