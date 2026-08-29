import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Building2,
  Globe,
  Users,
  Package,
  FileText,
  CreditCard,
  Car,
  MapPin,
  Settings,
  Palette,
  Calendar,
  GraduationCap,
  Clock,
  Shield,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  BookOpen,
  BarChart3,
  LogIn,
  UserPlus,
  Eye,
  Layers,
  Search,
  Database,
  Network,
  Code2,
  Server,
  Copy,
  Route,
  KeyRound,
  ExternalLink,
  FlaskConical,
  Rocket,
  Trash2,
} from "lucide-react";

export default function PlatformReferenceGuidePage() {
  const { user } = useAuth();
  const isPlatformOwner = user?.email === "solutions@plaidware.com";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1
          className="text-2xl font-bold"
          data-testid="text-reference-guide-title"
        >
          Platform Admin Guide
        </h1>
        <p className="text-muted-foreground mt-1">
          Everything you need to know about managing the Drivorata platform,
          onboarding schools, and overseeing operations.
        </p>
      </div>

      <Accordion
        type="multiple"
        className="space-y-3"
      >
        <AccordionItem value="onboarding" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-onboarding"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Onboarding a New School</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Follow these steps to add a new driving school to the platform and
              get them operational.
            </p>
            <div className="space-y-3">
              <StepCard
                step={1}
                title="Create the School"
                icon={Building2}
                description="Go to Platform > Tenants and click 'Add School'. Fill in the school name, a unique URL slug (used for their public website address like /site/my-school), contact email, phone number, and physical address. You can also set their logo and branding colors at this stage."
              />
              <StepCard
                step={2}
                title="Enter the School"
                icon={LogIn}
                description="From the Tenants list, click 'Enter School' to switch into that school's admin panel. This gives you full tenant_admin access within that school, allowing you to configure everything on their behalf."
              />
              <StepCard
                step={3}
                title="Add Locations"
                icon={MapPin}
                description="Go to Locations and add each physical address where the school holds classes. Include the street address, city, state, zip code, phone number, and timezone. Each location can host classroom sessions, in-car sessions, or both."
              />
              <StepCard
                step={4}
                title="Create Enrollment Packages"
                icon={Package}
                description="Go to Packages and create the school's course offerings. Set the package name, description, price, classroom credit hours, drive credit hours, age restrictions (minimum/maximum), and TDLR instruction method (Concurrent, Sequential, or None). Each package represents a course a student can enroll in."
              />
              <StepCard
                step={5}
                title="Invite the School Admin"
                icon={UserPlus}
                description="Go to Members and invite the school's owner or administrator by email. Assign them the 'School Admin' role with 'All Locations' scope. Once they accept the invitation and set up their password, they can manage their school independently."
              />
              <StepCard
                step={6}
                title="Set Up Payments"
                icon={CreditCard}
                description="Go to Settings > Payments and configure the school's Stripe and/or PayPal credentials. Enter their API keys, secret keys, and webhook secrets. Enable the payment methods they want to accept. This allows students to pay online during enrollment."
              />
              <StepCard
                step={7}
                title="Build Their Website"
                icon={FileText}
                description="Go to Pages and build the school's public-facing website. Add sections like Hero banner, Packages listing, Testimonials, FAQ, Contact information, and Location maps. Use the draft/publish workflow to preview before making changes live."
              />
              <StepCard
                step={8}
                title="Configure Custom Domain (Optional)"
                icon={Globe}
                description="Go to Settings > Domain to set up a custom domain. See the 'Custom Domain Setup' section below for detailed DNS configuration instructions. This allows the school's website to be accessible at their own domain name."
              />
            </div>

            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-700 dark:text-blue-400">
                    <p className="font-medium text-blue-800 dark:text-blue-300">
                      After Onboarding
                    </p>
                    <p className="mt-1">
                      Once you've completed these steps and handed off
                      credentials to the school admin, they can independently
                      manage their enrollments, schedule, team members, and
                      website content without needing platform-level access.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="overview-dashboard"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-overview-dashboard"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Platform Overview Dashboard</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              The Platform Overview page gives you a bird's-eye view of the
              entire platform.
            </p>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Key Metrics
                </h4>
                <p className="text-muted-foreground">
                  View total schools on the platform, total enrollments across
                  all schools, total registered users, and total revenue
                  generated. These numbers update in real time as schools
                  process enrollments and payments.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Monthly Trends
                </h4>
                <p className="text-muted-foreground">
                  Charts showing monthly enrollment trends, organization growth
                  (new schools added), and user sign-up patterns. Use these to
                  identify growth trends and seasonal patterns across the
                  platform.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Recent Activity
                </h4>
                <p className="text-muted-foreground">
                  See the most recent sign-ups and enrollments across all
                  schools. This helps you monitor platform activity and identify
                  any schools that may need attention or support.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="managing-schools"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-managing-schools"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Managing Schools</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              The Tenants page is your central hub for viewing and managing all
              schools on the platform.
            </p>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  Finding Schools
                </h4>
                <p className="text-muted-foreground">
                  Use the search bar to filter schools by name, slug, or email.
                  Each school card displays key stats: number of locations,
                  members, and enrollments, giving you a quick health check.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-muted-foreground" />
                  Entering a School
                </h4>
                <p className="text-muted-foreground">
                  Click "Enter School" on any school card to switch into that
                  school's admin panel. You'll have full School Admin access,
                  meaning you can manage their settings, members, enrollments,
                  schedule, pages, and everything else. The sidebar will switch
                  to the School view automatically.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  Platform/School Toggle
                </h4>
                <p className="text-muted-foreground">
                  Use the Platform/School toggle at the top of the sidebar to
                  switch between views. The Platform view shows platform-wide
                  management (tenants, team, billing). The School view shows the
                  admin panel for whichever school you've entered or selected.
                  You can freely switch back and forth.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  School Picker
                </h4>
                <p className="text-muted-foreground">
                  When in School view, the school picker dropdown in the sidebar
                  lets you quickly switch between schools. As a platform admin,
                  you'll see all schools on the platform. Use the search field
                  to find schools quickly in large lists.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="onboarding-tenant"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-onboarding-tenant"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">
                Onboarding a New School — End to End
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              The full process for bringing a new driving school onto Drivorata
              — from first contact to a live website connected to the platform.
            </p>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                Part 1 — Create the Tenant Account
              </h4>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Route className="h-4 w-4 text-muted-foreground" />
                  Option A: Platform Admin Creates It
                </h4>
                <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>
                    Go to{" "}
                    <strong className="text-foreground">
                      Platform → Tenants
                    </strong>{" "}
                    and click{" "}
                    <strong className="text-foreground">New School</strong>.
                  </li>
                  <li>
                    Fill in the school name and a unique slug (e.g.{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      sunshine-driving
                    </code>
                    ). The slug becomes part of their URL and API identifier.
                  </li>
                  <li>
                    Click{" "}
                    <strong className="text-foreground">Enter School</strong> on
                    the new card to switch into their admin panel.
                  </li>
                  <li>
                    Set up their branding (Settings → Branding), locations,
                    packages, and payment settings.
                  </li>
                  <li>
                    Go to <strong className="text-foreground">Members</strong>{" "}
                    and invite the school owner as a <em>Tenant Admin</em>.
                    They'll receive an email to set their password.
                  </li>
                </ol>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Option B: Lead Capture → Convert
                </h4>
                <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>
                    The school owner fills out the lead form at{" "}
                    <strong className="text-foreground">drivorata.com</strong>.
                  </li>
                  <li>
                    The lead appears in{" "}
                    <strong className="text-foreground">
                      Platform → Leads
                    </strong>{" "}
                    with status <em>New</em>.
                  </li>
                  <li>
                    Qualify the lead, add notes, and when ready click{" "}
                    <strong className="text-foreground">
                      Convert to Tenant
                    </strong>
                    .
                  </li>
                  <li>
                    This auto-creates the tenant, a user account, and a Tenant
                    Admin membership in one step.
                  </li>
                  <li>
                    Enter the school and complete the setup (branding,
                    locations, packages, payments).
                  </li>
                </ol>
              </div>

              <h4 className="font-medium text-foreground mt-2">
                Part 2 — Build Their External Website
              </h4>
              <p className="text-muted-foreground text-sm">
                Each school can have their own marketing website that talks to
                Drivorata as a headless backend. The website lives in a separate
                project (Automation-platform, WordPress, or any framework) and
                uses the API to read school data and process enrollments.
              </p>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  Step 1: Generate an API Key
                </h4>
                <p className="text-muted-foreground">
                  Enter the school's admin dashboard, go to{" "}
                  <strong className="text-foreground">
                    Settings → API Access
                  </strong>
                  , and click{" "}
                  <strong className="text-foreground">Generate New Key</strong>.
                  The full{" "}
                  <code className="bg-muted px-1 rounded text-xs">
                    drv_live_...
                  </code>{" "}
                  key is shown only once — copy it and store it as a secret in
                  the website's project.
                </p>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Step 2: Build the Site
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    Use the copy-paste Automation agent prompt in the{" "}
                    <strong className="text-foreground">Headless API</strong>{" "}
                    section below to scaffold a fully connected website in
                    minutes. The generated site will:
                  </p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>
                      Fetch packages, sessions, and locations from the API
                    </li>
                    <li>
                      Display them with the school's own branding and styling
                    </li>
                    <li>
                      Send enrollment and payment requests back to Drivorata
                    </li>
                    <li>
                      Redirect students to Stripe/PayPal and back via{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        externalSuccessUrl
                      </code>
                    </li>
                  </ul>
                  <p className="mt-1">
                    The interactive API docs at{" "}
                    <a
                      href="/api/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      /api/docs
                    </a>{" "}
                    provide a full reference for every endpoint.
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Step 3: Custom Domain (Optional)
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    The school can connect their own domain (e.g.{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      sunshinedrivingschool.com
                    </code>
                    ) in two places:
                  </p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>
                      <strong className="text-foreground">
                        External website:
                      </strong>{" "}
                      Point their domain DNS to wherever the external site is
                      hosted. The site uses the API slug to fetch data.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Drivorata admin portal:
                      </strong>{" "}
                      In their admin Settings → Custom Domain, add the domain
                      and verify via DNS TXT record. This lets Drivorata resolve
                      the custom domain to their tenant automatically.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-muted-foreground" />
                  Step 4: Staff Login URL
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    Share the white-labeled login URL with the school's staff:
                  </p>
                  <code className="block bg-muted px-2 py-1 rounded text-xs mt-1">
                    https://portal.schooldomain.com/login?tenant=sunshine-driving
                  </code>
                  <p className="mt-1">
                    Use the <code className="bg-muted px-1 rounded text-xs">portal.</code> subdomain of the school's custom domain.
                    This subdomain routes to Drivorata so the <code className="bg-muted px-1 rounded text-xs">/login</code> and <code className="bg-muted px-1 rounded text-xs">/admin</code> routes work.
                    The root domain stays pointed at the tenant website.
                    The login page shows the school's name and logo, and staff land
                    directly in their admin dashboard after signing in.
                  </p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="preview-mode"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-preview-mode"
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Preview Mode & Demo Data</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Preview Mode seeds a new school with realistic demo data so they
              can explore the full platform — schedules, enrollments, fleet,
              members, and more — before committing to live data. When they're
              ready, one click clears everything and starts fresh.
            </p>

            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Demo Data Is Not Real
                    </p>
                    <p className="mt-1">
                      All seeded sessions, enrollments, vehicles, packages,
                      locations, and demo members are placeholders. Demo member
                      accounts cannot log in. The school admin's own account is
                      always preserved and is the only real account in preview
                      mode.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                What Gets Seeded
              </h4>
              <div className="grid gap-2">
                {[
                  { icon: MapPin, label: "3 Locations", detail: "Austin HQ, Dallas North, Houston West — real Texas addresses" },
                  { icon: Car, label: "8 Vehicles", detail: "Tesla Model 3 and Model Y units spread across all 3 locations" },
                  { icon: Package, label: "5 Packages", detail: "Teen Complete, Drive-Only, Classroom-Only, Adult Refresher, Premium Bundle" },
                  { icon: Users, label: "23 Demo Members", detail: "7 instructors, 12 students, 4 parents — scoped to their locations" },
                  { icon: Calendar, label: "~700 Sessions", detail: "Past 12 months (COMPLETED) + next 6 months (SCHEDULED) — always date-relative" },
                  { icon: GraduationCap, label: "12 Enrollments", detail: "Spread across all 3 locations with realistic statuses (completed, in_progress, confirmed)" },
                  { icon: CreditCard, label: "Payments & Credits", detail: "One cash payment and credit ledger per enrollment; bookings for all enrolled students" },
                ].map(({ icon: Icon, label, detail }) => (
                  <div key={label} className="flex gap-3 items-start border rounded-lg p-3">
                    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                Enabling Preview Mode
              </h4>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Option A: During Lead Conversion
                </h4>
                <p className="text-muted-foreground">
                  When converting a lead to a tenant (Platform → Leads → Convert
                  to Tenant), toggle on{" "}
                  <strong className="text-foreground">
                    Start with Demo Data (Preview Mode)
                  </strong>
                  . This is enabled by default. The demo data is seeded
                  automatically immediately after the tenant and admin account
                  are created.
                </p>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Option B: Manually from the Tenant List
                </h4>
                <p className="text-muted-foreground">
                  Go to Platform → Tenants, open the dropdown menu (⋯) on any
                  school card, and click{" "}
                  <strong className="text-foreground">
                    Enable Preview with Demo Data
                  </strong>
                  . The demo data is seeded immediately. Tenants currently in
                  preview show an amber{" "}
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                    Preview
                  </Badge>{" "}
                  badge on their card.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                Disabling Preview Mode (Platform Admin)
              </h4>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                  Disable from the Tenant List
                </h4>
                <p className="text-muted-foreground">
                  Open the dropdown menu on any preview-mode school card and
                  click{" "}
                  <strong className="text-foreground">
                    Disable Preview & Clear Demo Data
                  </strong>
                  . This purges all demo data and clears the preview flag. The
                  school admin's account and any pages, theme, or settings they
                  configured are preserved.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                Going Live (School Admin Initiated)
              </h4>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-muted-foreground" />
                  The Go Live Banner
                </h4>
                <p className="text-muted-foreground">
                  While in preview mode, the school admin sees a prominent amber
                  banner at the top of their admin panel reading "You're in
                  Preview Mode." The banner includes a{" "}
                  <strong className="text-foreground">Go Live</strong> button.
                  Clicking it opens a confirmation dialog that clearly lists
                  what will be deleted (all demo data) and what will be
                  preserved (their account, theme, website pages, and settings)
                  before they confirm. Once confirmed, the demo data is purged
                  and the preview flag is cleared — their school is now live and
                  ready for real students.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                What Is Preserved When Going Live
              </h4>
              <div className="grid gap-2 text-muted-foreground">
                {[
                  "School admin account(s) with their login credentials",
                  "School name, logo, address, and contact info",
                  "Theme colors and branding",
                  "All website pages and published content",
                  "Payment method configuration (Stripe/PayPal/Cash settings)",
                  "Custom domain settings",
                  "API keys",
                ].map((item) => (
                  <div key={item} className="flex gap-2 items-start">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <p className="text-sm">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-700 dark:text-blue-400">
                    <p className="font-medium text-blue-800 dark:text-blue-300">
                      Recommended Onboarding Flow
                    </p>
                    <p className="mt-1">
                      Convert the lead with preview mode enabled → Enter the
                      school and walk them through the demo data → Let the
                      school admin explore independently → When they're
                      satisfied, they click Go Live from their dashboard. No
                      platform action is needed on your end.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="website-options"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-website-options"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">
                Three Ways to Build a School Website
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-4">
            <p className="text-sm text-muted-foreground">
              Every school on Drivorata can have a public-facing website that
              showcases packages, accepts enrollments, and processes payments.
              There are three distinct approaches depending on the school's
              needs and technical capacity.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Approach
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Setup Effort
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Hosting
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Code Required
                    </th>
                    <th className="text-left py-2 font-medium text-foreground">
                      Best For
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      1. Built-in Page Builder
                    </td>
                    <td className="py-2 pr-4">Minutes</td>
                    <td className="py-2 pr-4">Drivorata</td>
                    <td className="py-2 pr-4">None</td>
                    <td className="py-2">
                      Schools that want to get online fast with no technical
                      setup
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      2. Automation agent Scaffold
                    </td>
                    <td className="py-2 pr-4">30–60 min</td>
                    <td className="py-2 pr-4">
                      Automation-platform / any host
                    </td>
                    <td className="py-2 pr-4">Minimal (copy/paste)</td>
                    <td className="py-2">
                      Schools that want a custom design but don't have a
                      developer
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-foreground">
                      3. Custom External Website
                    </td>
                    <td className="py-2 pr-4">Days–weeks</td>
                    <td className="py-2 pr-4">Anywhere</td>
                    <td className="py-2 pr-4">Full development</td>
                    <td className="py-2">
                      Schools with a developer or existing website to integrate
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">
                    Approach 1 — Built-in Page Builder
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    No code · Fastest
                  </Badge>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    The page builder is built directly into every school's admin
                    dashboard. The school owner builds their site visually — no
                    hosting, no code, no separate project needed. The site is
                    served from Drivorata's domain and can be connected to a
                    custom domain via DNS.
                  </p>
                  <div className="space-y-2 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">How it works:</strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        Enter the school's admin panel → go to{" "}
                        <strong className="text-foreground">Pages</strong>.
                      </li>
                      <li>
                        Click{" "}
                        <strong className="text-foreground">Add Page</strong> or
                        start from a{" "}
                        <strong className="text-foreground">Template</strong> (6
                        pre-built multi-page layouts available).
                      </li>
                      <li>
                        Add sections by clicking the + button — choose from 35
                        section types: Hero, Packages, Testimonials, FAQ,
                        Gallery, Video, Team, Contact, CTA, Timeline, and more.
                      </li>
                      <li>
                        Customize each section's content, colors, fonts,
                        background images, padding, and layout variant.
                      </li>
                      <li>
                        Drag and drop to reorder sections. Toggle visibility to
                        hide sections without deleting them.
                      </li>
                      <li>
                        Set up a{" "}
                        <strong className="text-foreground">
                          Global Header and Footer
                        </strong>{" "}
                        that appear on every page automatically.
                      </li>
                      <li>
                        Use{" "}
                        <strong className="text-foreground">
                          Draft/Publish
                        </strong>{" "}
                        workflow — changes only go live when explicitly
                        published.
                      </li>
                      <li>
                        Preview on Desktop, Tablet, and Mobile before
                        publishing.
                      </li>
                    </ol>
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">
                        Custom Domain:
                      </strong>{" "}
                      Go to{" "}
                      <strong className="text-foreground">
                        Settings → Custom Domain
                      </strong>
                      . Enter the domain (e.g.{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        www.sunshinedrivingschool.com
                      </code>
                      ), then add the provided DNS TXT record to the domain's
                      registrar. Once verified, all traffic to that domain
                      routes to the school's built-in site.
                    </p>
                    <p>
                      <strong className="text-foreground">Enrollment:</strong>{" "}
                      The built-in site includes enrollment forms powered by the
                      school's active packages and payment settings. Stripe and
                      PayPal redirect students back to the built-in site
                      automatically.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">
                    Approach 2 — Automation Agent Scaffold
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    Minimal code · Fast
                  </Badge>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    The school (or you on their behalf) starts a new automation
                    project and provides a pre-written prompt to the automation
                    Agent. In 30–60 minutes automation agent builds a
                    fully-connected React website: it fetches packages,
                    sessions, and locations from the Drivorata API, handles
                    enrollment, and processes payments via Stripe/PayPal
                    redirect.
                  </p>
                  <div className="space-y-2 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">
                        What the agent builds:
                      </strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>
                        Home page with hero, features, and package listing
                      </li>
                      <li>Schedule page with filterable upcoming sessions</li>
                      <li>
                        Enrollment form wired to{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          POST /checkout/start
                        </code>
                      </li>
                      <li>
                        Thank-you page that verifies enrollment status after
                        payment
                      </li>
                      <li>Custom domain configuration ready to deploy</li>
                    </ul>
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Steps:</strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        Generate an API key in the school's{" "}
                        <strong className="text-foreground">
                          Settings → API Access
                        </strong>{" "}
                        panel.
                      </li>
                      <li>
                        Create a new Automation project (blank Node.js or
                        React).
                      </li>
                      <li>
                        Paste the Automation agent prompt from the{" "}
                        <strong className="text-foreground">
                          Headless API
                        </strong>{" "}
                        section below into Agent.
                      </li>
                      <li>
                        Fill in the school slug and API key when Agent asks for
                        configuration.
                      </li>
                      <li>
                        Agent builds and runs the site. Review it, then publish
                        via Automation Deployments.
                      </li>
                      <li>
                        Point the school's domain DNS to the deployed Automation
                        app URL.
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">
                    Approach 3 — Custom External Website
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    Full control · Developer needed
                  </Badge>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    A developer builds the school's site from scratch on any
                    stack (Next.js, WordPress, Webflow, plain HTML, etc.) and
                    uses the Drivorata Public API to pull live data and push
                    enrollments. This gives complete design and code freedom.
                  </p>
                  <div className="space-y-1 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">
                        Available endpoints:
                      </strong>
                    </p>
                    <div className="bg-muted/50 rounded p-2 font-mono text-xs space-y-1">
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/:slug — Full school data
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/:slug/packages — Active packages
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/:slug/locations — Active locations
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/:slug/sessions — Upcoming sessions
                        (filterable)
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/:slug/instructors — Active
                        instructors
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/:slug/payment-methods — Payment
                        config
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          POST
                        </Badge>
                        /api/public/tenant/:slug/checkout/start — Start
                        enrollment + payment
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/enrollments/:id/status — Check status after
                        payment
                      </p>
                    </div>
                    <p className="mt-2">
                      <strong className="text-foreground">
                        Authentication:
                      </strong>{" "}
                      All cross-origin requests require the API key in the
                      header:
                    </p>
                    <code className="block bg-muted px-2 py-1 rounded text-xs">
                      Authorization: Bearer drv_live_...
                    </code>
                    <p className="mt-2">
                      <strong className="text-foreground">
                        Payment return:
                      </strong>{" "}
                      Pass{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        externalSuccessUrl
                      </code>{" "}
                      and{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        externalCancelUrl
                      </code>{" "}
                      in the checkout request so students return to the custom
                      website after payment.
                    </p>
                    <p className="mt-1">
                      <strong className="text-foreground">Staff login:</strong>{" "}
                      Add a "Staff Login" link pointing to{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        https://portal.domain.com/login?tenant=slug
                      </code>
                      {" "}— use the <code className="bg-muted px-1 rounded text-xs">portal.</code> subdomain of the school's custom domain (it routes to Drivorata). The link should not open in a new tab. Shows the school's branding via the{" "}
                      <code className="bg-muted px-1 rounded text-xs">?tenant=</code>{" "}
                      parameter.
                    </p>
                    <div className="mt-2">
                      <a
                        href="/api/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs inline-flex items-center gap-1"
                        data-testid="link-platform-swagger"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Interactive API documentation (Swagger) — try endpoints
                        live
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="platform-team" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-platform-team"
          >
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Platform Team Management</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Manage the people who have access to the platform administration
              level.
            </p>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  Adding Team Members
                </h4>
                <p className="text-muted-foreground">
                  Go to Platform &gt; Team and click "Add Member". Enter their
                  email address and select their role. The user must already
                  have an account on the platform (they need to sign up first).
                  Only platform admins can add new team members.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Platform Roles
                </h4>
                <div className="text-muted-foreground space-y-2">
                  <p>
                    <strong className="text-foreground">Admin:</strong> Full
                    access to all platform features. Can create schools, manage
                    the platform team, enter any school, view all analytics, and
                    manage billing. Can add and remove other team members.
                  </p>
                  <p>
                    <strong className="text-foreground">Support:</strong>{" "}
                    Read-only access to platform data. Can view schools, team
                    members, and analytics but cannot make changes. Ideal for
                    support staff who need visibility without modification
                    rights.
                  </p>
                </div>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Removing Team Members
                </h4>
                <p className="text-muted-foreground">
                  Click the remove button next to a team member to revoke their
                  platform-level access. This only removes their platform role —
                  it does not affect any school-level roles they may have.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="custom-domain" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-custom-domain"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">
                Custom Domain Setup for Schools
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              When setting up a custom domain for a school, you'll need to guide
              them through DNS configuration. Here's the process.
            </p>
            <div className="space-y-3">
              <StepCard
                step={1}
                title="Enter the Domain"
                icon={Globe}
                description="Enter the school by clicking 'Enter School', then go to Settings > Domain. Type in the school's custom domain (e.g., www.myschool.com). The system generates a unique DNS verification token automatically."
              />
              <StepCard
                step={2}
                title="Add DNS TXT Record for Verification"
                icon={Shield}
                description="The school owner needs to log in to their DNS provider (Cloudflare, GoDaddy, Namecheap, etc.) and add a TXT record on their root domain with the verification token shown on the Domain page. The format is: driveSchool-verify=your-token"
              />
              <StepCard
                step={3}
                title="Add DNS CNAME Record"
                icon={ArrowRight}
                description="Add a CNAME record pointing the domain (e.g., www) to the platform's app domain. If using Cloudflare, the proxy must be set to 'DNS Only' (gray cloud icon) to avoid SSL conflicts."
              />
              <StepCard
                step={4}
                title="Verify the Domain"
                icon={CheckCircle2}
                description="Back on the Domain settings page, click 'Check DNS'. Once the TXT record has propagated (can take up to 48 hours), the domain status will change to 'Verified'. The school's public site will then be accessible at their custom domain."
              />
            </div>

            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Important Notes
                    </p>
                    <ul className="mt-1 space-y-1 text-amber-700 dark:text-amber-400">
                      <li>
                        DNS changes can take up to 48 hours to propagate
                        worldwide.
                      </li>
                      <li>
                        Both www and bare domain versions will work once
                        verified.
                      </li>
                      <li>
                        The school's admin panel is accessible at
                        their-domain.com/admin.
                      </li>
                      <li>
                        If using Cloudflare, the orange cloud proxy must be
                        disabled (DNS only).
                      </li>
                      <li>
                        Each school can only have one custom domain at a time.
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="roles" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-roles"
          >
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">All Roles Overview</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              The platform uses a role hierarchy across two levels:
              platform-level and school-level. Users can hold roles at both
              levels simultaneously.
            </p>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Platform-Level Roles</h4>
              <div className="grid gap-3">
                <RoleCard
                  role="Platform Admin"
                  badge="platform_admin"
                  description="Full access to all platform features. Can create and manage schools, manage the platform team, enter any school with admin-level access, view platform-wide analytics, and manage billing."
                />
                <RoleCard
                  role="Platform Support"
                  badge="platform_support"
                  description="Read-only access to platform data. Can view schools, team members, and analytics for monitoring and support purposes, but cannot make any changes."
                />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">School-Level Roles</h4>
              <div className="grid gap-3">
                <RoleCard
                  role="School Admin"
                  badge="tenant_admin"
                  description="Full access within a specific school. Can manage settings, locations, packages, members, enrollments, schedule, fleet, website pages, payments, domain, and theme. This is typically the school owner or manager."
                />
                <RoleCard
                  role="Office Manager"
                  badge="office_manager"
                  description="Day-to-day operations within a school. Can manage enrollments, schedule sessions, view member lists, and handle student bookings. Cannot change school settings, payment configuration, or website content."
                />
                <RoleCard
                  role="Instructor"
                  badge="instructor"
                  description="Teaching workflow access. Can view their assigned schedule, mark student attendance, manage their own availability windows, and see student rosters for their sessions. Can be scoped to specific locations."
                />
                <RoleCard
                  role="Student"
                  badge="student"
                  description="Student portal access. Can view their upcoming bookings, track classroom and drive credit progress, and see their enrollment details. Account is automatically created when enrollment is confirmed."
                />
                <RoleCard
                  role="Parent"
                  badge="parent"
                  description="Guardian access for minors under 18. Linked to the student's account automatically when parent/guardian information is provided during enrollment. Can view the student's enrollment status and progress."
                />
              </div>
            </div>

            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-700 dark:text-blue-400">
                    <p className="font-medium text-blue-800 dark:text-blue-300">
                      Multi-Role Support
                    </p>
                    <p className="mt-1">
                      Users can hold multiple roles within the same school
                      (e.g., an instructor who is also a student). The system
                      consolidates these into a single member view and shows all
                      assigned roles. The highest-privilege role determines the
                      dashboard view.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="billing" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-billing"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Platform Billing</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              The platform billing section is currently being developed. When
              complete, it will include:
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">
                  Tenant Subscriptions:
                </strong>{" "}
                Manage monthly or annual subscription plans for each school on
                the platform.
              </p>
              <p>
                <strong className="text-foreground">Invoicing:</strong> Generate
                and track invoices for school subscriptions and platform usage
                fees.
              </p>
              <p>
                <strong className="text-foreground">Payment Tracking:</strong>{" "}
                Monitor payment history, outstanding balances, and revenue
                across all schools.
              </p>
              <p>
                <strong className="text-foreground">Usage Analytics:</strong>{" "}
                Track per-school usage metrics like enrollment volume, active
                users, and storage consumption.
              </p>
            </div>
            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    This feature is coming soon. The billing page is currently a
                    placeholder and will be fully functional in a future update.
                  </p>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="headless-api" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-headless-api"
          >
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">
                Headless API — Connect an External Website
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Use Drivorata as a headless backend. Build your school's website
              separately (in its own Automation project, WordPress, or any
              framework) and connect it to Drivorata to read school data and
              process enrollments.
            </p>

            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="text-sm">
                    <a
                      href="/api/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-700 dark:text-blue-300 hover:underline"
                      data-testid="link-api-docs"
                    >
                      Interactive API Documentation (Swagger)
                    </a>
                    <span className="text-blue-600 dark:text-blue-400 ml-1">
                      — Try endpoints live in your browser
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  Step 1: Generate an API Key
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    Go to{" "}
                    <strong className="text-foreground">
                      Settings &gt; API Access
                    </strong>{" "}
                    in your school's admin dashboard and click{" "}
                    <strong className="text-foreground">
                      Generate New Key
                    </strong>
                    .
                  </p>
                  <p>
                    Copy the key immediately — it won't be shown again. Store it
                    as an environment variable in your external website's
                    project (e.g.,{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      DRIVORATA_API_KEY
                    </code>
                    ).
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Step 2: Read Data (Public Endpoints)
                </h4>
                <div className="text-muted-foreground space-y-2">
                  <p>
                    All cross-origin requests require your API key. Replace{" "}
                    <code className="bg-muted px-1 rounded text-xs">:slug</code>{" "}
                    with your school's slug and include your key in every
                    request:
                  </p>
                  <code className="block bg-muted px-2 py-1 rounded text-xs mb-2">
                    Authorization: Bearer drv_live_...
                  </code>
                  <div className="bg-muted/50 rounded p-2 font-mono text-xs space-y-1">
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        GET
                      </Badge>
                      /api/public/tenant/:slug — Full school data (name, logo,
                      theme, packages, locations)
                    </p>
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        GET
                      </Badge>
                      /api/public/tenant/:slug/packages — Active packages with
                      pricing
                    </p>
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        GET
                      </Badge>
                      /api/public/tenant/:slug/locations — Active locations with
                      addresses
                    </p>
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        GET
                      </Badge>
                      /api/public/tenant/:slug/sessions?type=CLASSROOM&amp;from=2025-01-01
                      — Upcoming sessions
                    </p>
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        GET
                      </Badge>
                      /api/public/tenant/:slug/instructors — Active instructors
                    </p>
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        GET
                      </Badge>
                      /api/public/tenant/:slug/payment-methods — Accepted
                      payment methods
                    </p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Step 3: Enrollment &amp; Payments (Write Endpoints)
                </h4>
                <div className="text-muted-foreground space-y-2">
                  <p>
                    When a student enrolls on your website, send the data to
                    Drivorata for processing:
                  </p>
                  <div className="bg-muted/50 rounded p-2 font-mono text-xs space-y-1">
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        POST
                      </Badge>
                      /api/public/tenant/:slug/checkout/start — Start enrollment
                      + payment
                    </p>
                    <p>
                      <Badge variant="outline" className="text-xs mr-2">
                        GET
                      </Badge>
                      /api/public/enrollments/:id/status — Check enrollment
                      status after payment
                    </p>
                  </div>
                  <p>
                    The checkout endpoint accepts{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      externalSuccessUrl
                    </code>{" "}
                    and{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      externalCancelUrl
                    </code>{" "}
                    fields so after Stripe/PayPal payment, the student lands
                    back on <em>your</em> website (e.g.,{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      https://myschool.com/thank-you
                    </code>
                    ).
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-muted-foreground" />
                  Step 4: Staff Portal Link
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>Add a "Staff Login" link on your website pointing to:</p>
                  <code className="block bg-muted px-2 py-1 rounded text-xs">
                    https://portal.your-domain.com/login?tenant=your-school-slug
                  </code>
                  <p className="mt-1">
                    Use the <code className="bg-muted px-1 rounded text-xs">portal.</code> subdomain — it routes to Drivorata so{" "}
                    <code className="bg-muted px-1 rounded text-xs">/login</code> and{" "}
                    <code className="bg-muted px-1 rounded text-xs">/admin</code> work there.
                    Your root domain stays on the tenant website. The{" "}
                    <code className="bg-muted px-1 rounded text-xs">?tenant=</code>{" "}
                    parameter shows your school's name and logo on the login page.
                    The link should not open in a new tab. Staff are taken directly to
                    the admin dashboard after signing in.
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Example: Fetch Packages (JavaScript)
                </h4>
                <pre className="bg-muted/50 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap">{`const DRIVORATA_URL = "https://drivorata.com";
const SCHOOL_SLUG = "your-school-slug";

// Fetch packages
const res = await fetch(\`\${DRIVORATA_URL}/api/public/tenant/\${SCHOOL_SLUG}/packages\`);
const packages = await res.json();

// Start enrollment checkout
const checkout = await fetch(
  \`\${DRIVORATA_URL}/api/public/tenant/\${SCHOOL_SLUG}/checkout/start\`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "STRIPE",
      packageId: packages[0].id,
      locationId: null,
      student: {
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        phone: "555-1234",
      },
      externalSuccessUrl: "https://myschool.com/thank-you",
      externalCancelUrl: "https://myschool.com/enroll",
    }),
  }
);
const { redirectUrl } = await checkout.json();
// Redirect student to Stripe/PayPal
window.location.href = redirectUrl;`}</pre>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Automation agent Prompt — Build a Connected Tenant Website
                </h4>
                <p className="text-muted-foreground">
                  Copy the prompt below and paste it into a new Automation agent
                  session to have it build a driving school website that
                  connects to Drivorata.
                </p>
                <HeadlessApiPrompt />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {isPlatformOwner && (
          <>
            <AccordionItem
              value="multi-tenancy"
              className="border rounded-lg px-4"
            >
              <AccordionTrigger
                className="hover:no-underline"
                data-testid="accordion-multi-tenancy"
              >
                <div className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">
                    Multi-Tenancy Architecture
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <p className="text-sm text-muted-foreground">
                  A technical overview of how Drivorata isolates data per
                  school, resolves tenants, and serves custom domains. Use this
                  as a reference for building similar multi-tenant systems.
                </p>

                <div className="space-y-3 text-sm">
                  <div className="border rounded-lg p-3 space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      Data Model &amp; Tenant Isolation
                    </h4>
                    <div className="text-muted-foreground space-y-2">
                      <p>
                        Every school (tenant) is a row in the{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          tenants
                        </code>{" "}
                        table with a unique{" "}
                        <strong className="text-foreground">slug</strong> (e.g.,{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          sunshine-driving
                        </code>
                        ) and an optional{" "}
                        <strong className="text-foreground">
                          custom domain
                        </strong>{" "}
                        (e.g.,{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          www.sunshinedrivingschool.com
                        </code>
                        ).
                      </p>
                      <p>
                        All other tables — pages, members, enrollments,
                        packages, locations, sessions, vehicles, etc. — include
                        a{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          tenantId
                        </code>{" "}
                        foreign key that links every record back to a specific
                        school. This ensures complete data isolation: one school
                        can never see another school's data.
                      </p>
                      <p>
                        The tenant record also stores branding fields (logo,
                        colors, theme), a{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          domainVerified
                        </code>{" "}
                        flag, and a{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          domainVerificationCode
                        </code>{" "}
                        for DNS verification.
                      </p>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Route className="h-4 w-4 text-muted-foreground" />
                      Tenant Resolution — Two Entry Points
                    </h4>
                    <div className="text-muted-foreground space-y-2">
                      <p>
                        There are two ways a visitor reaches a school's website:
                      </p>
                      <p>
                        <strong className="text-foreground">
                          1. Slug-based (default):
                        </strong>{" "}
                        The URL{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          /site/:slug
                        </code>{" "}
                        is used. The app reads the{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          :slug
                        </code>{" "}
                        parameter from the URL, looks up the tenant by slug, and
                        renders that school's website. Example:{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          drivorata.com/site/sunshine-driving
                        </code>
                      </p>
                      <p>
                        <strong className="text-foreground">
                          2. Custom domain:
                        </strong>{" "}
                        When a request arrives on a hostname that isn't the main
                        app domain, the backend looks up which tenant owns that
                        domain via the{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          customDomain
                        </code>{" "}
                        field and serves their content. Example:{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          www.sunshinedrivingschool.com
                        </code>
                      </p>
                      <p>
                        Both paths fetch from the same public API endpoint (
                        <code className="bg-muted px-1 rounded text-xs">
                          /api/public/tenant/:slug
                        </code>
                        ) which returns all data needed to render the site:
                        pages, theme, packages, locations, global header/footer
                        sections.
                      </p>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      DNS Verification Flow
                    </h4>
                    <div className="text-muted-foreground space-y-2">
                      <p>
                        Before a custom domain becomes active, the school must
                        prove they own it:
                      </p>
                      <p>
                        <strong className="text-foreground">Step 1:</strong> The
                        school admin enters their desired domain in Settings
                        &gt; Domain. The system generates a unique verification
                        code (e.g.,{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          drivorata-verify=abc123
                        </code>
                        ) and stores it on the tenant record.
                      </p>
                      <p>
                        <strong className="text-foreground">Step 2:</strong> The
                        school owner adds a{" "}
                        <strong className="text-foreground">
                          DNS TXT record
                        </strong>{" "}
                        on their domain at their DNS provider (Cloudflare,
                        GoDaddy, Namecheap, etc.) with the verification code.
                      </p>
                      <p>
                        <strong className="text-foreground">Step 3:</strong> The
                        school owner also adds a{" "}
                        <strong className="text-foreground">
                          CNAME record
                        </strong>{" "}
                        pointing their domain to the platform's deployment
                        hostname.
                      </p>
                      <p>
                        <strong className="text-foreground">Step 4:</strong> The
                        admin clicks "Check DNS". The backend uses Node.js{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          dns.promises.resolveTxt()
                        </code>{" "}
                        to read the domain's TXT records and look for the
                        verification code. No external DNS APIs are needed.
                      </p>
                      <p>
                        <strong className="text-foreground">Step 5:</strong>{" "}
                        Once verified,{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          domainVerified
                        </code>{" "}
                        is set to{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          true
                        </code>{" "}
                        and the domain becomes active.
                      </p>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      Backend Request Flow
                    </h4>
                    <div className="text-muted-foreground space-y-2">
                      <p>
                        When a request comes in, the backend determines context:
                      </p>
                      <p>
                        <strong className="text-foreground">
                          Main app domain?
                        </strong>{" "}
                        Serve the SaaS platform (admin dashboard, login, lead
                        magnet page).
                      </p>
                      <p>
                        <strong className="text-foreground">
                          Known custom domain?
                        </strong>{" "}
                        Look up the tenant by domain in the database, serve
                        their public site.
                      </p>
                      <p>
                        <strong className="text-foreground">
                          Slug-based route (
                          <code className="bg-muted px-1 rounded text-xs">
                            /site/:slug
                          </code>
                          )?
                        </strong>{" "}
                        Look up the tenant by slug, serve their public site.
                      </p>
                      <p>
                        All admin API routes enforce tenant isolation through
                        middleware that validates the authenticated user's
                        membership and role within the target tenant (Role-Based
                        Access Control).
                      </p>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      Frontend Routing
                    </h4>
                    <div className="text-muted-foreground space-y-2">
                      <p>
                        The frontend has two separate React page components that
                        render the same public website but are resolved
                        differently:
                      </p>
                      <p>
                        <strong className="text-foreground">PublicSite</strong>{" "}
                        — mounted at{" "}
                        <code className="bg-muted px-1 rounded text-xs">
                          /site/:slug/:page?
                        </code>
                        . Reads the slug from the URL, fetches tenant data, and
                        renders the page.
                      </p>
                      <p>
                        <strong className="text-foreground">
                          PublicSiteByDomain
                        </strong>{" "}
                        — used when the hostname is a custom domain. Resolves
                        the slug via domain lookup, then fetches and renders
                        identically.
                      </p>
                      <p>
                        Both components share the same section rendering engine
                        (
                        <code className="bg-muted px-1 rounded text-xs">
                          renderSection
                        </code>
                        ) which supports 35+ section types, ensuring visual
                        consistency regardless of how the site is accessed.
                      </p>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="replication-prompt"
              className="border rounded-lg px-4"
            >
              <AccordionTrigger
                className="hover:no-underline"
                data-testid="accordion-replication-prompt"
              >
                <div className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">
                    Replication Prompt — Build This in Another Project
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <p className="text-sm text-muted-foreground">
                  Copy the prompt below and paste it into a new Automation agent
                  session to replicate the multi-tenancy and custom domain
                  pattern in another application.
                </p>

                <div className="relative">
                  <CopyablePrompt />
                </div>

                <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div className="text-sm text-blue-700 dark:text-blue-400">
                        <p className="font-medium text-blue-800 dark:text-blue-300">
                          Adapting the Prompt
                        </p>
                        <p className="mt-1">
                          Replace "myapp" with your actual app name and adjust
                          the data model fields to match your domain. The core
                          pattern (tenants table, slug/domain resolution, DNS
                          TXT verification) works for any multi-tenant SaaS
                          regardless of industry.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="assisted-website-prompt"
              className="border rounded-lg px-4"
            >
              <AccordionTrigger
                className="hover:no-underline"
                data-testid="accordion-assisted-website-prompt"
              >
                <div className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">
                    Assisted Website Build Prompt — Approach 2
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <p className="text-sm text-muted-foreground">
                  Use this prompt to build a fully connected, custom-designed
                  school website for a client in about an hour. Paste it into a
                  new blank Node.js project with your AI coding assistant and let it do the work. The
                  website will proxy all data through an Express backend (keeping
                  the API key server-side) and display live packages, sessions,
                  locations, and a full enrollment + payment flow.
                </p>

                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                        <p className="font-medium text-amber-800 dark:text-amber-300">
                          Before pasting the prompt
                        </p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          <li>
                            In the school's admin dashboard, go to{" "}
                            <strong className="text-amber-800 dark:text-amber-300">
                              Settings → API Access
                            </strong>{" "}
                            and generate a new API key. Copy it — shown only
                            once.
                          </li>
                          <li>
                            Create a new blank Node.js / TypeScript project
                            (any host works — Railway or Cloudflare Pages are
                            good fits).
                          </li>
                          <li>
                            In that project's{" "}
                            <strong className="text-amber-800 dark:text-amber-300">
                              environment variables
                            </strong>
                            , add three secrets:
                            <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs ml-1">
                              DRIVORATA_URL
                            </code>
                            ,{" "}
                            <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs">
                              SCHOOL_SLUG
                            </code>
                            ,{" "}
                            <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs">
                              DRIVORATA_API_KEY
                            </code>
                            .
                          </li>
                          <li>
                            Open the Agent tab in that project, paste the prompt
                            below, and press Enter.
                          </li>
                          <li>
                            Review and customize the generated site with the
                            client, then deploy it.
                          </li>
                        </ol>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <AssistedWebsitePrompt />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="scalability" className="border rounded-lg px-4">
              <AccordionTrigger
                className="hover:no-underline"
                data-testid="accordion-scalability"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">Scalability &amp; Performance</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <p className="text-sm text-muted-foreground">
                  Analysis of how the current Railway (single web service) + Railway PostgreSQL architecture, fronted by Cloudflare, holds up at the 10-school target scale. Last reviewed August 2026.
                </p>

                <div className="border rounded-lg p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Target Scale Baseline
                  </h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>10 schools × 5 locations, 100 students, 10 instructors, 15 sessions/week each:</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-2">
                      <li>50 total locations</li>
                      <li>1,000 students, 100 instructors</li>
                      <li>~7,800 sessions/year across all schools</li>
                      <li>~1,500 bookings/week at full capacity</li>
                    </ul>
                  </div>
                </div>

                <div className="border rounded-lg p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    What Holds Up Fine
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {[
                      "All CRUD operations — members, enrollments, bookings, payments. Each scoped by tenantId index; row counts per tenant stay small.",
                      "Scheduling engine — conflict checking runs a single scoped query per session. No full-table scans.",
                      "Page builder and public tenant sites — read-heavy, browser-cached via TanStack Query. Low server load.",
                      "Authentication and session management — PostgreSQL-backed sessions via connect-pg-simple. Stateless across autoscale instances.",
                      "Multi-tenant data isolation — tenantId foreign key on every table; no cross-tenant leakage risk at this scale.",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border rounded-lg p-3 space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Two Things to Watch
                  </h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">1. Neon connection pooling</p>
                      <p>
                        Autoscale instances spin up per request. First requests in a traffic burst can be 200–400 ms slower due to Neon serverless cold-start. At 10 schools this is acceptable. If it becomes noticeable, enable Neon's built-in PgBouncer pooler from the Neon dashboard — no code changes needed.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">2. Sessions list endpoint (no pagination yet)</p>
                      <p>
                        The schedule query currently fetches all sessions for a tenant in one request. With 700+ sessions per tenant this will slow the schedule page as schools fill up. Add server-side limit/offset pagination to the sessions endpoint before onboarding real schools at volume.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
                  <h4 className="font-medium text-sm">Honest Ceiling</h4>
                  <p className="text-sm text-muted-foreground">
                    A single Railway web service + Railway Postgres, with Cloudflare caching static assets and uploads at the edge, comfortably supports <strong className="text-foreground">50–100 active tenants</strong> with moderate concurrent usage before architectural changes (more replicas, read replicas, a dedicated connection pooler) become necessary. 10 schools is well inside safe territory with room to grow.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </>
        )}
      </Accordion>
    </div>
  );
}

function CopyablePrompt() {
  const [copied, setCopied] = useState(false);
  const promptText = `Build a multi-tenant SaaS application with custom domain support. Here's the architecture:

DATABASE SCHEMA:
- Create a "tenants" table with: id (serial primary key), name, slug (unique), customDomain (nullable, unique), domainVerified (boolean, default false), domainVerificationCode (text), and any branding fields you need (logo, colors, etc.).
- All other tables should have a "tenantId" foreign key referencing the tenants table to isolate data per tenant.

TENANT RESOLUTION:
- Create a slug-based public route at /site/:slug that looks up the tenant by slug and renders their public-facing content.
- Create a domain resolution mechanism: when a request arrives on a custom domain (not the main app domain), look up the tenant by their customDomain field and serve their content.
- The public API endpoint /api/public/tenant/:slug should return all tenant data needed for rendering (pages, theme, settings, etc.).

CUSTOM DOMAIN VERIFICATION:
- When a tenant sets a custom domain, generate a unique verification code and store it (e.g., myapp-verify=<uuid>).
- Show the tenant instructions to add a DNS TXT record with that code on their domain.
- Create a verification endpoint that uses Node.js dns.promises.resolveTxt() to check if the TXT record exists on the domain.
- Only set domainVerified = true after successful verification.

FRONTEND ROUTING:
- Create two React page components: one for slug-based access (/site/:slug) and one for custom-domain access.
- Both should fetch from the same public API and render the same tenant website, just resolved differently.

ADMIN DASHBOARD:
- Tenant admins should be able to set their custom domain and see the verification status and instructions.
- Include a "Verify Domain" button that triggers the DNS check.

KEY TECHNICAL DETAILS:
- Use Express.js for the backend, Drizzle ORM with PostgreSQL, React with Vite for the frontend.
- Use dns.promises.resolveTxt() for DNS verification — no external DNS APIs needed.
- The CNAME record for custom domains should point to the app's deployment hostname.
- Enforce tenant isolation on all API routes using middleware that validates the tenant context.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        onClick={handleCopy}
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 z-10 gap-1"
        data-testid="button-copy-prompt"
      >
        <Copy className="h-3 w-3" />
        {copied ? "Copied!" : "Copy"}
      </Button>
      <pre
        className="bg-muted/50 border rounded-lg p-4 pr-20 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[400px] overflow-y-auto"
        data-testid="text-replication-prompt"
      >
        {promptText}
      </pre>
    </div>
  );
}

function HeadlessApiPrompt() {
  const [copied, setCopied] = useState(false);
  const promptText = `Build a driving school website that connects to Drivorata (a SaaS backend for driving schools) as a headless API. The website should fetch all school data from Drivorata's API and display it with custom styling. Enrollments and payments should be processed through Drivorata.

IMPORTANT CONFIGURATION:
- Store these as environment variables (Automation-platform Secrets):
  - DRIVORATA_URL = "https://your-drivorata-instance.automation-platform.app" (the URL of the Drivorata platform)
  - SCHOOL_SLUG = "your-school-slug" (the slug assigned to this school in Drivorata)
  - STAFF_PORTAL_URL — construct from the tenant API response:
      Fetch GET /api/public/tenant/{SCHOOL_SLUG} and read tenantData.tenant.customDomain.
      Strip "www." prefix if present to get the base domain.
      STAFF_PORTAL_URL = "https://portal." + baseDomain + "/login?tenant=" + SCHOOL_SLUG
      The portal subdomain routes to Drivorata (not this tenant app), so /login and /admin work there.
      The root/www domain stays on this tenant website.
      The link should NOT open in a new tab — use a regular <a> tag without target="_blank".
- All API calls go to: {DRIVORATA_URL}/api/public/tenant/{SCHOOL_SLUG}/...

DATA FETCHING (all endpoints are public, no authentication needed, all return JSON):

1. GET /api/public/tenant/{slug} — Returns complete school data:
   Response: { tenant: { id, name, slug, logoUrl, phone, email, customDomain }, theme: {...}, packages: [...], locations: [...] }

2. GET /api/public/tenant/{slug}/packages — Returns active packages:
   Response: [{ id, name, description, price (in cents), classroomHoursRequired, driveHoursRequired, ageRestriction, active }]

3. GET /api/public/tenant/{slug}/locations — Returns active locations:
   Response: [{ id, name, address, city, state, zip, phone, email }]

4. GET /api/public/tenant/{slug}/sessions — Returns upcoming available sessions:
   Query params: ?type=CLASSROOM|DRIVE&locationId=123&from=2025-06-01&to=2025-07-01
   Response: [{ id, type, startAt, endAt, locationId, capacity, bookedCount, availableSpots, instructorName }]

5. GET /api/public/tenant/{slug}/instructors — Returns active instructors:
   Response: [{ id, firstName, lastName, profileImageUrl, instructorType }]

6. GET /api/public/tenant/{slug}/payment-methods — Returns accepted payment methods:
   Response: { stripe: { publishableKey } | null, paypal: { clientId, mode } | null, cash: boolean }

ENROLLMENT & PAYMENT FLOW:

1. POST /api/public/tenant/{slug}/checkout/start
   Request body: {
     provider: "STRIPE" | "PAYPAL" | "CASH",
     packageId: number,
     locationId: number | null,
     student: { firstName, lastName, email, phone?, dateOfBirth?, parentName?, parentEmail?, parentPhone? },
     parent: { name?, email?, phone? },  // required if student is under 18
     externalSuccessUrl: "https://myschool.com/thank-you",  // IMPORTANT: student returns here after payment
     externalCancelUrl: "https://myschool.com/enroll"        // student returns here if they cancel
   }
   Response: { redirectUrl: "https://checkout.stripe.com/..." } for Stripe/PayPal
             { cashPayment: true, enrollmentId: 123, paymentId: 456 } for cash

2. After payment, check enrollment status:
   GET /api/public/enrollments/{enrollmentId}/status
   Response: { id, status, firstName, lastName, packageSnapshot, priceSnapshotCents, payment: { provider, status, amountCents } }

WEBSITE PAGES TO BUILD:

1. Home Page — Hero section, featured packages, school overview, testimonials placeholder
2. Packages/Pricing Page — Display all packages from the API with name, description, price (convert cents to dollars), hours, instruction method. Each package has an "Enroll Now" button.
3. Schedule Page — Display upcoming sessions from the API. Allow filtering by type (Classroom/Drive) and location. Show date, time, available spots, instructor name.
4. Locations Page — Display all locations with addresses, phone numbers, and optionally an embedded Google Map.
5. Enrollment Page — Multi-step form: select package, enter student info (first name, last name, email, phone, date of birth), if under 18 collect parent info, select payment method, submit to checkout/start endpoint, redirect to Stripe/PayPal or show cash confirmation.
6. Thank You / Success Page — Shown after payment redirect. Use the enrollment ID from the URL query param to fetch and display enrollment status.
7. About Page — Static content about the school (can be customized later).
8. Contact Page — Show school email and phone from the API, plus a simple contact form.

STAFF LOGIN:
- Add a "Staff Login" link in the website footer or header
- It should link to: {STAFF_PORTAL_URL} (the portal subdomain login page with tenant context)
- The link should NOT open in a new tab — use a regular <a> tag without target="_blank"
- Staff (admin, office manager, instructor) manage operations in the admin dashboard at the portal subdomain

IMPORTANT IMPLEMENTATION NOTES:
- All prices from the API are in CENTS. Divide by 100 to display as dollars (e.g., 29900 cents = $299.00)
- For the checkout flow: after calling checkout/start, redirect the user's browser to the returned redirectUrl for Stripe/PayPal payments
- The externalSuccessUrl should point to your thank-you page. Drivorata will append ?enrollment={id} to it automatically
- The externalCancelUrl should point back to your enrollment page
- All API endpoints support CORS — you can call them from the browser (client-side) or from your server
- Use server-side rendering or static site generation where possible for SEO
- Make the design professional, modern, and mobile-responsive
- Use the school's name and branding from the /api/public/tenant/{slug} response
- The school logo URL from the API can be used directly as an image src`;

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        onClick={handleCopy}
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 z-10 gap-1"
        data-testid="button-copy-headless-prompt"
      >
        <Copy className="h-3 w-3" />
        {copied ? "Copied!" : "Copy"}
      </Button>
      <pre
        className="bg-muted/50 border rounded-lg p-4 pr-20 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[400px] overflow-y-auto"
        data-testid="text-headless-api-prompt"
      >
        {promptText}
      </pre>
    </div>
  );
}

function AssistedWebsitePrompt() {
  const [copied, setCopied] = useState(false);
  const promptText = `Build a professional, mobile-responsive driving school website that connects to Drivorata (a SaaS backend for driving schools) as its data and payment engine. All school data comes from the Drivorata API; the API key is kept server-side via an Express proxy.

=== ENVIRONMENT VARIABLES (set these as project secrets / environment variables before starting) ===
- DRIVORATA_URL   — e.g. "https://drivorata.com"
- SCHOOL_SLUG     — the school's slug in Drivorata, e.g. "sunshine-driving"
- DRIVORATA_API_KEY — the API key generated in the school's Settings → API Access

=== TECH STACK ===
- Backend: Node.js + Express (TypeScript)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- Routing: Wouter
- Data fetching: TanStack Query v5
- All Drivorata API calls go through Express proxy routes so the API key is never exposed to the browser

=== EXPRESS PROXY ARCHITECTURE ===
Create an Express server that proxies all Drivorata API calls server-side.

The proxy attaches the Authorization header automatically:
  Authorization: Bearer <DRIVORATA_API_KEY>

Proxy routes to implement (all forward to DRIVORATA_URL/api/public/tenant/SCHOOL_SLUG/...):

GET  /api/school          → /api/public/tenant/:slug       (school info, theme, packages, locations)
GET  /api/packages        → /api/public/tenant/:slug/packages
GET  /api/locations       → /api/public/tenant/:slug/locations
GET  /api/sessions        → /api/public/tenant/:slug/sessions   (forward query params: type, locationId, from, to)
GET  /api/instructors     → /api/public/tenant/:slug/instructors
GET  /api/payment-methods → /api/public/tenant/:slug/payment-methods
POST /api/enroll          → /api/public/tenant/:slug/checkout/start
GET  /api/enrollment/:id/status → /api/public/enrollments/:id/status

=== DRIVORATA API RESPONSE SHAPES ===

GET /api/school
Response: {
  tenant: { id, name, slug, logoUrl, phone, email, address, city, state, zip },
  theme: { primaryColor, secondaryColor, fontFamily },
  packages: [...],
  locations: [...]
}

GET /api/packages
Response: Array of {
  id: number,
  name: string,
  description: string,
  price: number,          ← ALWAYS IN CENTS (divide by 100 for display)
  classroomHoursRequired: number,
  driveHoursRequired: number,
  ageRestriction: string, ← e.g. "14-17" or "18+"
  active: boolean
}

GET /api/locations
Response: Array of {
  id: number,
  name: string,
  address: string,
  city: string,
  state: string,
  zip: string,
  phone: string,
  email: string
}

GET /api/sessions
Query params: type=CLASSROOM|DRIVE, locationId=number, from=YYYY-MM-DD, to=YYYY-MM-DD
Response: Array of {
  id: number,
  type: "CLASSROOM" | "DRIVE",
  startAt: string (ISO 8601),
  endAt: string (ISO 8601),
  locationId: number,
  capacity: number,
  bookedCount: number,
  availableSpots: number,
  instructorName: string
}

GET /api/instructors
Response: Array of {
  id: number,
  firstName: string,
  lastName: string,
  profileImageUrl: string | null,
  instructorType: "CLASSROOM" | "DRIVE" | "BOTH"
}

GET /api/payment-methods
Response: {
  stripe: { publishableKey: string } | null,
  paypal: { clientId: string, mode: "sandbox" | "live" } | null,
  cash: boolean
}

POST /api/enroll
Request body: {
  provider: "STRIPE" | "PAYPAL" | "CASH",
  packageId: number,
  locationId: number | null,
  student: {
    firstName: string,
    lastName: string,
    email: string,
    phone?: string,
    dateOfBirth?: string,   ← ISO date, required if student is under 18
    parentName?: string,
    parentEmail?: string,
    parentPhone?: string
  },
  parent: {                 ← required object if student is under 18
    name?: string,
    email?: string,
    phone?: string
  },
  externalSuccessUrl: string,  ← your /thank-you page URL (Drivorata appends ?enrollment=ID)
  externalCancelUrl: string    ← your /enroll page URL
}
Response (Stripe/PayPal): { redirectUrl: string }   ← redirect the browser here
Response (Cash):          { cashPayment: true, enrollmentId: number, paymentId: number }

GET /api/enrollment/:id/status
Response: {
  id: number,
  status: "pending" | "confirmed" | "in_progress" | "completed",
  firstName: string,
  lastName: string,
  packageSnapshot: { name: string, price: number },
  priceSnapshotCents: number,
  payment: { provider: string, status: string, amountCents: number }
}

=== PAGES TO BUILD ===

1. HOME PAGE (/)
   - Hero section with school name, tagline, and "Enroll Now" CTA button linking to /enroll
   - Featured packages section: show up to 3 packages as cards with name, price, key details
   - "Why choose us" section with 3–4 icon + text feature highlights (pull school info from API)
   - Locations overview: show location names and cities
   - Instructors section: show instructor headshots (or initials avatar), names, and type
   - Footer with school contact info, staff login link, and copyright

2. PACKAGES PAGE (/packages)
   - Display all active packages in a card grid
   - Each card shows: name, price (converted from cents, e.g. $299.00), description, classroom hours, drive hours, age restriction
   - "Enroll Now" button on each card links to /enroll?packageId=X
   - Loading skeleton while fetching

3. SCHEDULE PAGE (/schedule)
   - Filterable list/table of upcoming sessions (fetch next 90 days: from=today, to=today+90d)
   - Filter controls: Session Type (All / Classroom / Drive), Location (All / each location name)
   - Each session row shows: date, day of week, time (local timezone), type badge, location, available spots badge, instructor name
   - Show "Full" badge (red) when availableSpots === 0
   - Show "Almost Full" badge (yellow) when availableSpots <= 2
   - Empty state when no sessions match filters

4. LOCATIONS PAGE (/locations)
   - Card per location: name, full address, phone, email
   - Optional: embedded Google Maps iframe using the address

5. ABOUT PAGE (/about)
   - Static content: school mission, history placeholder, team intro
   - Pull school name and contact info from the API
   - Instructors grid with headshots and bios (instructorType label)

6. ENROLLMENT PAGE (/enroll)
   Multi-step form (show step indicator):

   Step 1 — Select Package
   - List all packages with name, price, description, hours
   - If ?packageId= query param is present, pre-select that package
   - "Select" button per package

   Step 2 — Student Information
   - First name, last name, email, phone (all required)
   - Date of birth (required — used to determine if under 18)
   - If student age < 18: show parent/guardian section (parent name, parent email, parent phone — all required)
   - Location selection dropdown (populated from /api/locations)

   Step 3 — Payment Method
   - Show available payment methods from /api/payment-methods
   - Stripe option: show card (redirect to Stripe Checkout)
   - PayPal option: show PayPal button (redirect to PayPal)
   - Cash option: show "Pay at location" with confirmation text
   - "Complete Enrollment" button

   Step 4 — Submitting
   - Call POST /api/enroll with provider, packageId, locationId, student object, parent object (if under 18), externalSuccessUrl pointing to /thank-you on this site, externalCancelUrl pointing to /enroll
   - For Stripe/PayPal: redirect browser to the returned redirectUrl
   - For Cash: redirect to /thank-you?enrollment=ID&cash=true

7. THANK YOU PAGE (/thank-you)
   - Read ?enrollment=ID from URL query params
   - Fetch GET /api/enrollment/:id/status
   - Show: student name, package name, price paid, payment method, enrollment status
   - If status is "confirmed" or "in_progress": show green success message
   - If status is "pending": show amber "pending review" message
   - "View Schedule" and "Back to Home" buttons
   - Loading skeleton while fetching; error state if enrollment ID not found

8. CONTACT PAGE (/contact)
   - School email and phone (from /api/school)
   - Locations list with addresses
   - Simple static contact form (name, email, message) — form submits via mailto or shows a "thank you" message; no backend processing needed

=== NAVIGATION HEADER ===
- School logo (from tenant.logoUrl) + school name
- Nav links: Home, Packages, Schedule, Locations, About, Contact
- Mobile hamburger menu
- Prominent "Enroll Now" CTA button (links to /enroll)
- The nav should be sticky/fixed at top with a slight blur backdrop

=== FOOTER ===
- School name, phone, email
- Quick links: Packages, Schedule, Locations, About, Contact, Privacy Policy (static page)
- Small "Staff Login" link (opens in new tab) pointing to: process.env.DRIVORATA_URL + "/login?tenant=" + process.env.SCHOOL_SLUG
- Copyright line with current year

=== DESIGN REQUIREMENTS ===
- Professional, modern aesthetic — clean whitespace, readable typography, strong CTAs
- Mobile-first and fully responsive
- Use the school's primary and secondary colors from the theme response for accent colors (CSS custom properties)
- Loading skeletons for all async data sections
- Error states with a retry button when API calls fail
- Smooth page transitions
- Accessible: proper heading hierarchy, alt text on images, keyboard-navigable forms
- SEO: unique <title> and <meta description> per page using the school's name

=== CRITICAL IMPLEMENTATION NOTES ===
- ALL prices from the Drivorata API are in CENTS. Always divide by 100 and format as USD. Example: 49900 cents = $499.00
- The DRIVORATA_API_KEY must NEVER be sent to the browser. All API calls go through your Express proxy.
- After calling POST /api/enroll, redirect the user's browser to the returned redirectUrl for Stripe and PayPal payments. Do not try to handle payment client-side.
- The externalSuccessUrl you send must be the absolute URL of this deployed app's /thank-you page. Drivorata will append ?enrollment=ID automatically.
- Age check: calculate age from dateOfBirth at enrollment time. If age < 18, show and require the parent/guardian fields.
- Session times are in ISO 8601 format (UTC). Display them in the user's local timezone using JavaScript's Intl.DateTimeFormat or date-fns-tz.
- The sessions endpoint returns only future scheduled sessions by default. Use the from/to query params to control the date window.
- Staff login link: \${DRIVORATA_URL}/login?tenant=\${SCHOOL_SLUG} — staff manage everything (schedules, enrollments, attendance) in the Drivorata admin dashboard.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        onClick={handleCopy}
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 z-10 gap-1"
        data-testid="button-copy-assisted-prompt"
      >
        <Copy className="h-3 w-3" />
        {copied ? "Copied!" : "Copy"}
      </Button>
      <pre
        className="bg-muted/50 border rounded-lg p-4 pr-20 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[500px] overflow-y-auto"
        data-testid="text-assisted-website-prompt"
      >
        {promptText}
      </pre>
    </div>
  );
}

function StepCard({
  step,
  title,
  icon: Icon,
  description,
}: {
  step: number;
  title: string;
  icon: any;
  description: string;
}) {
  return (
    <div className="flex gap-3 items-start" data-testid={`step-card-${step}`}>
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-foreground text-background text-xs font-bold shrink-0 mt-0.5">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <h4 className="font-medium text-sm">{title}</h4>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}

function RoleCard({
  role,
  badge,
  description,
}: {
  role: string;
  badge: string;
  description: string;
}) {
  return (
    <div className="border rounded-lg p-3" data-testid={`role-card-${badge}`}>
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-xs">
          {role}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
