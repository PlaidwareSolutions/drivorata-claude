# 🚗 Driving School Multi-Tenant SaaS Platform (Texas-Focused)

## 📌 Overview

This project is a **multi-tenant SaaS platform** for Texas driving schools.

It provides:

- Customizable tenant marketing websites
- Online registration + payments
- Classroom + in-car scheduling
- Fleet management
- Instructor mobile workflow
- TDLR compliance enforcement
- Multi-location management
- Reporting & revenue tools

The platform is built for scalability, tenant isolation, and Texas regulatory compliance.

---

# 🏗️ System Architecture Overview

The platform consists of four primary layers:

1. Core Business Engine (Shared Across All Tenants)
2. Tenant Website Engine (Customizable Per School)
3. Instructor Copilot (Mobile-First Operations)
4. Multi-Tenant SaaS Infrastructure

---

# 1️⃣ Core Business Engine (Shared Across All Tenants)

This engine powers all schools using the platform.

## Features

- Multi-location management
- Role-based access control (RBAC)
  - Admin
  - Office Manager
  - Instructor (In-Class / In-Car)
  - Student
  - Parent
- Course & package management
- Stripe payments + credits ledger
- Classroom scheduling (capacity-based)
- In-car scheduling (Instructor + Vehicle locking)
- Fleet management + maintenance blocking
- Progress tracking (classroom hours + drive hours)
- TDLR compliance enforcement (Block vs Concurrent rules)
- DE-964 data readiness + export
- Notifications (email/SMS)
- Reporting (revenue, utilization, no-shows)

All tenants share this logic.

---

# 2️⃣ Tenant Website Engine (Customizable Per School)

Each driving school gets its own marketing website powered by a data-driven page builder.

## Features

- Customizable marketing website
- Editable pages:
  - Home
  - Pricing
  - Locations
  - FAQ
  - Contact
- Section-based page builder:
  - Hero
  - Packages
  - Testimonials
  - FAQs
  - Location cards
  - CTA sections
- Theme customization:
  - Colors
  - Fonts
  - Branding
  - Logo
- Draft → Preview → Publish workflow
- Embedded registration & checkout flow

No hardcoded designs per tenant — fully template-driven.

---

# 3️⃣ Instructor Copilot (Mobile-First Operations)

Optimized for instructors in vehicles.

## Features

- Today’s schedule view
- Start / End drive tracking
- Strict drive-time enforcement
- One-tap grading system
- Attendance & no-show capture
- Notes per session
- Optional GPS stamping (Phase 2+)

---

# 4️⃣ Multi-Tenant SaaS Infrastructure

## Platform-Level Capabilities

- Tenant isolation (`tenant_id` everywhere)
- Subdomain or slug-based routing
- RBAC enforcement
- Stripe webhook integration
- Versioned website publishing
- PostgreSQL + Prisma schema
- Background job processing (reminders, maintenance, etc.)

---

# 🚀 Development Phases

---

# 🧱 Phase 0 — Platform Foundation

## Goal
Establish secure multi-tenant architecture and RBAC.

## Deliverables
- Tenant model + slug resolution
- Authentication
- Role-based access control
- Base Prisma schema
- Stripe integration skeleton
- Core database relationships

## Outcome
A secure SaaS foundation ready for feature development.

---

# 🌐 Phase 1 — Tenant Website Engine (MVP)

## Goal
Enable schools to present themselves and accept payments.

## Deliverables
- Theme system (colors, fonts, branding)
- Page builder (Hero, Packages, FAQ, Locations, Contact)
- Draft → Preview → Publish workflow
- Tenant-specific public pages
- Enrollment + Stripe checkout
- Student account creation

## Outcome
Schools can sell online professionally.

---

# 📅 Phase 2 — Core Scheduling Engine

## Goal
Enable classroom and in-car scheduling.

## Deliverables
- Instructor availability blocks
- Vehicle resource model
- Classroom capacity scheduling
- In-car booking with instructor + vehicle locking
- Booking rule enforcement
- Office manager calendar view

## Outcome
Full operational scheduling system.

---

# ⚖️ Phase 3 — TDLR Compliance Engine

## Goal
Automate Texas regulatory enforcement.

## Deliverables
- Permit upload + verification
- 6-hour Concurrent rule enforcement
- Classroom + drive hour tracking
- Compliance gatekeeper before booking
- DE-964 export (PDF/CSV)
- Compliance dashboard

## Outcome
Schools stay compliant automatically.

---

# 🚗 Phase 4 — Instructor Copilot

## Goal
Optimize instructor workflow.

## Deliverables
- Mobile-first instructor dashboard
- Start/End drive time enforcement
- One-tap grading
- Attendance tracking
- No-show handling
- Optional GPS stamping

## Outcome
Operational efficiency + reduced disputes.

---

# 📊 Phase 5 — Operations & Revenue Optimization

## Goal
Make the platform mission-critical for schools.

## Deliverables
- Revenue dashboards
- Instructor utilization reports
- Fleet maintenance auto-blocking
- No-show analytics
- SMS reminders
- Cancellation fee automation
- Refund & credit management

## Outcome
Full business intelligence layer.

---

# 🌎 Phase 6 — SaaS Scaling & Premium Features

## Goal
Prepare platform for growth and expansion.

## Deliverables
- Subdomain + custom domain mapping
- Multi-tenant analytics
- Template marketplace
- Advanced pickup-zone logic
- Travel-time buffers
- Automated review collection
- Referral system

## Outcome
Enterprise-ready vertical SaaS platform.

---

# 🧠 Big Picture

This platform combines:

- Website Builder
- Scheduling System
- Compliance Engine
- Fleet Manager
- Instructor Workflow Tool
- Payments + Revenue Engine
- Multi-Location Management

All under one unified, scalable SaaS architecture hosted on Railway with Cloudflare at the edge.

---
