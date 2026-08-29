import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Globe,
  Users,
  Package,
  FileText,
  CreditCard,
  Car,
  MapPin,
  Palette,
  Calendar,
  GraduationCap,
  Clock,
  Shield,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  BookOpen,
  LayoutDashboard,
  UserPlus,
  Settings,
  Filter,
  Eye,
  ClipboardList,
  UserCheck,
  Ban,
  Mail,
  KeyRound,
  Code2,
  Server,
  ExternalLink,
  FlaskConical,
  Rocket,
  Trash2,
  Zap,
} from "lucide-react";

export default function ReferenceGuidePage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1
          className="text-2xl font-bold"
          data-testid="text-reference-guide-title"
        >
          School Admin Guide
        </h1>
        <p className="text-muted-foreground mt-1">
          Everything you need to know about managing your driving school — from
          setting up locations to scheduling sessions and enrolling students.
        </p>
      </div>

      <div
        className="border rounded-lg p-4 bg-muted/30 space-y-3"
        data-testid="card-developer-resources"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Developer & Headless API Resources</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Building your own storefront against Drivorata? Start with these two references — the interactive Swagger page lists every endpoint and lets you test calls live, and the integrator guide explains how the package, cart, upsell and checkout flows fit together.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="border rounded-md p-3 hover-elevate active-elevate-2 bg-background block"
            data-testid="link-dev-swagger"
          >
            <div className="flex items-center gap-2 font-medium text-sm">
              <ExternalLink className="h-4 w-4" />
              Interactive API Reference
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Browse every endpoint by tag, see request/response schemas, and try calls in your browser. Raw spec at <code className="bg-muted px-1 rounded">/api/docs.json</code>.
            </p>
          </a>
          <a
            href="/api/headless-guide.md"
            target="_blank"
            rel="noopener noreferrer"
            className="border rounded-md p-3 hover-elevate active-elevate-2 bg-background block"
            data-testid="link-dev-headless-guide"
          >
            <div className="flex items-center gap-2 font-medium text-sm">
              <FileText className="h-4 w-4" />
              Headless Integrator Guide
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Long-form walkthrough: package fields (kind, audience, upsell flags), choosing express vs cart checkout, error-code branching, and a recovery cheat-sheet.
            </p>
          </a>
        </div>
      </div>

      <Accordion
        type="multiple"
        className="space-y-3"
      >
        <AccordionItem
          value="getting-started"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-getting-started"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Getting Started Checklist</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Follow this checklist to get your school fully set up and ready to
              accept students.
            </p>
            <div className="space-y-3">
              <StepCard
                step={1}
                title="Update School Settings"
                icon={Settings}
                description="Go to Settings > School Settings and fill in your school's details: name, phone, email, address, and your TDLR school number if applicable. Upload your school's logo for branding."
              />
              <StepCard
                step={2}
                title="Add Your Locations"
                icon={MapPin}
                description="Go to Locations and add each physical location where you hold classes. Include full address, phone number, and timezone. You'll assign sessions and instructors to these locations later."
              />
              <StepCard
                step={3}
                title="Create Course Packages"
                icon={Package}
                description="Go to Packages and create your course offerings. Set the price, classroom credit hours, drive credit hours, age restrictions, and TDLR instruction method. These packages appear on your public enrollment form."
              />
              <StepCard
                step={4}
                title="Invite Your Team"
                icon={UserPlus}
                description="Go to Members and invite your staff by email — office managers, instructors, and any other team members. Assign them appropriate roles and location access."
              />
              <StepCard
                step={5}
                title="Add Your Vehicles"
                icon={Car}
                description="Go to Vehicles and add your fleet of training cars. Each vehicle needs a name/label, and can be assigned to a specific location. Track vehicle status (active, maintenance, retired)."
              />
              <StepCard
                step={6}
                title="Set Up Online Payments"
                icon={CreditCard}
                description="Go to Settings > Payments to connect your Stripe and/or PayPal accounts. This enables students to pay online when they enroll through your public website."
              />
              <StepCard
                step={7}
                title="Build Your Website"
                icon={FileText}
                description="Go to Pages to create your public website. Add sections like a hero banner, package listings, testimonials, FAQ, and contact info. Publish when you're ready to go live."
              />
              <StepCard
                step={8}
                title="Customize Your Brand"
                icon={Palette}
                description="Go to Settings > Theme to set your school's brand colors. These colors apply to your public website and give it a professional, customized look."
              />
              <StepCard
                step={9}
                title="Connect a Custom Domain (Optional)"
                icon={Globe}
                description="Go to Settings > Domain to use your own domain name (e.g., www.myschool.com) instead of the default platform URL. See the 'Custom Domain' section below for setup details."
              />
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
              <span className="font-semibold">Preview Mode & Going Live</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Your school may have been set up in Preview Mode — a safe sandbox
              pre-loaded with realistic demo data so you can explore every part
              of the platform before you go live with real students.
            </p>

            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      None of the demo data is real
                    </p>
                    <p className="mt-1">
                      The sessions, enrollments, packages, vehicles, locations,
                      and student accounts you see are all placeholders. Demo
                      accounts cannot log in. Your admin account is the only
                      real account in the system. Feel free to explore, click
                      around, and test features — nothing you see here will
                      affect real students.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                What's Included in the Demo
              </h4>
              <div className="grid gap-2">
                {[
                  {
                    icon: MapPin,
                    label: "3 Locations",
                    detail:
                      "Austin HQ, Dallas North, Houston West — fully configured with addresses and timezones",
                  },
                  {
                    icon: Car,
                    label: "8 Vehicles",
                    detail:
                      "Tesla Model 3 and Model Y units across all 3 locations, with real statuses",
                  },
                  {
                    icon: Package,
                    label: "5 Course Packages",
                    detail:
                      "Teen Complete, Drive-Only, Classroom-Only, Adult Refresher, Premium Bundle — all TDLR-formatted",
                  },
                  {
                    icon: Users,
                    label: "23 Demo Members",
                    detail:
                      "7 instructors, 12 students, and 4 parents spread across all 3 locations",
                  },
                  {
                    icon: Calendar,
                    label: "~700 Sessions",
                    detail:
                      "12 months of past completed sessions + 6 months of upcoming scheduled sessions — always date-relative",
                  },
                  {
                    icon: GraduationCap,
                    label: "12 Enrollments",
                    detail:
                      "A mix of completed, in-progress, and confirmed enrollments with payments and credit ledger entries",
                  },
                ].map(({ icon: Icon, label, detail }) => (
                  <div
                    key={label}
                    className="flex gap-3 items-start border rounded-lg p-3"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">
                The Preview Mode Banner
              </h4>
              <p className="text-muted-foreground">
                As long as your school is in preview mode, an amber banner
                appears at the top of every admin page. It reminds you that
                you're working with demo data and provides a{" "}
                <strong className="text-foreground">Go Live</strong> button when
                you're ready to switch to your real data.
              </p>
            </div>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium text-foreground">Going Live</h4>
              <div className="space-y-3">
                <StepCard
                  step={1}
                  title="Click 'Go Live' in the Preview Banner"
                  icon={Rocket}
                  description="The amber preview banner at the top of your dashboard includes a 'Go Live' button. Click it when you're ready to clear the demo data and start fresh with real students."
                />
                <StepCard
                  step={2}
                  title="Review the Confirmation Dialog"
                  icon={AlertCircle}
                  description="A dialog will list exactly what gets deleted (all demo data) and what gets preserved (your account, theme, website pages, payment settings). Read it carefully before confirming."
                />
                <StepCard
                  step={3}
                  title="Confirm and Go Live"
                  icon={CheckCircle2}
                  description="Click 'Go Live' in the dialog to confirm. All demo data is immediately and permanently removed. The preview banner disappears and your school is now in live mode."
                />
                <StepCard
                  step={4}
                  title="Add Your Real Data"
                  icon={Settings}
                  description="After going live, start by adding your real locations, packages, vehicles, and team members. Then build your website pages and configure payment settings before enrolling your first student."
                />
              </div>
            </div>

            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-700 dark:text-blue-400">
                    <p className="font-medium text-blue-800 dark:text-blue-300">
                      What's Preserved When You Go Live
                    </p>
                    <ul className="mt-1 space-y-1">
                      <li>Your admin account and login credentials</li>
                      <li>School name, logo, address, and contact info</li>
                      <li>Theme colors and branding</li>
                      <li>All website pages and published content</li>
                      <li>
                        Payment method settings (Stripe, PayPal, Cash
                        configuration)
                      </li>
                      <li>Custom domain settings</li>
                      <li>API keys</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-red-700 dark:text-red-400">
                    <p className="font-medium text-red-800 dark:text-red-300">
                      What Gets Permanently Deleted
                    </p>
                    <ul className="mt-1 space-y-1">
                      <li>All demo locations, vehicles, and packages</li>
                      <li>All demo sessions (past and future)</li>
                      <li>
                        All demo enrollments, payments, and credit ledger
                        entries
                      </li>
                      <li>All demo bookings</li>
                      <li>
                        All demo member accounts (instructors, students,
                        parents)
                      </li>
                    </ul>
                    <p className="mt-2 font-medium">
                      Going live cannot be undone.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="dashboard" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-dashboard"
          >
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Dashboard Overview</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              The dashboard is customized based on your role and shows the
              information most relevant to you.
            </p>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Admin / Office Manager View
                </h4>
                <p className="text-muted-foreground">
                  See total enrollments, monthly revenue, upcoming sessions, and
                  active team members at a glance. Quick access cards link to
                  key management areas like enrollments, schedule, and members.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  Quick Actions Panel
                </h4>
                <p className="text-muted-foreground">
                  The Quick Actions panel on the Admin dashboard puts common
                  setup and day-to-day tasks one click away. Shortcut buttons
                  jump straight into the relevant page (Add Vehicle, Add
                  Location, Add Package, Add Promotion, Schedule Session,
                  Invite Member) with the create or invite dialog already open,
                  while three guided wizards walk you through more involved
                  workflows. The panel is only shown to tenant admins and
                  office managers — instructors and students don't see it.
                </p>
                <ul className="text-muted-foreground list-disc list-inside space-y-1">
                  <li>
                    <span className="font-medium text-foreground">
                      Manual Enrollment wizard
                    </span>{" "}
                    — for walk-ins or phone sign-ups. Pick a package (and a
                    location/cohort when relevant), enter the student's
                    contact info plus a parent/guardian when the student is
                    under 18, then choose a payment method: <em>Pending</em>{" "}
                    (no payment recorded), <em>Cash paid</em> (records a
                    completed cash payment and confirms the enrollment), or{" "}
                    <em>External</em> (recorded outside the system, also
                    confirms). The student receives the same enrollment
                    confirmation email a self-serve enrollment would trigger.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">
                      Private Lesson wizard
                    </span>{" "}
                    — schedule a one-on-one drive in a single flow. Pick the
                    drive offering, instructor, vehicle, location and start
                    time, then attach a paying student. The wizard creates the
                    session and the booking together so credits are deducted
                    correctly.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">
                      Broadcast Message wizard
                    </span>{" "}
                    — send an announcement to a group of users. Choose an
                    audience (all members, all active students, or a single
                    role like Students/Parents/Instructors/Office
                    Managers/Admins) and optionally narrow it to specific
                    locations, pick the channels (email, in-app, or both),
                    write a subject + body, and click Preview to see the
                    recipient count broken down by channel before sending. Each
                    recipient is counted once even if they hold multiple roles,
                    and unsubscribed contacts are skipped automatically.
                  </li>
                </ul>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Instructor View
                </h4>
                <p className="text-muted-foreground">
                  See your sessions for today, upcoming sessions this week, and
                  your student roster. Quick links to your availability settings
                  and session details with attendance tracking.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  Student View
                </h4>
                <p className="text-muted-foreground">
                  See your upcoming bookings, credit progress (classroom and
                  drive hours remaining), and enrollment status. Access your
                  booking history and session details.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="locations" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-locations"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Managing Locations</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Locations represent the physical places where your school holds
              classes and driving sessions.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Adding a Location:</strong>{" "}
                Click "Add Location" and enter the name, full address (street,
                city, state, zip), phone number, and timezone. The timezone
                ensures session times display correctly for that location.
              </p>
              <p>
                <strong className="text-foreground">Location Scope:</strong>{" "}
                When you add team members, you can scope their access to
                specific locations. For example, an instructor might only work
                at your north campus. Location scope controls what they see on
                the schedule and availability pages.
              </p>
              <p>
                <strong className="text-foreground">
                  Multi-Location Filtering:
                </strong>{" "}
                Throughout the admin panel (schedule, availability,
                enrollments), you can filter by location to focus on a specific
                campus. The location filter in the header lets you switch views
                quickly.
              </p>
              <p>
                <strong className="text-foreground">Service Area:</strong>{" "}
                Optionally define a service area description for each location
                to help students understand the geographic coverage for driving
                lessons.
              </p>
              <p>
                <strong className="text-foreground">Editing & Deleting:</strong>{" "}
                Click any location card to edit its details. Locations can be
                removed if they have no associated sessions or members.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="packages" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-packages"
          >
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Course Packages & TDLR</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Packages define the courses your school offers, including pricing,
              credit hours, and TDLR compliance details.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Creating a Package:</strong>{" "}
                Set the name, description, and price. Define how many classroom
                credit hours and drive credit hours are included. These credits
                are tracked throughout the enrollment lifecycle.
              </p>
              <p>
                <strong className="text-foreground">Age Restrictions:</strong>{" "}
                Set minimum and/or maximum age for the package. This is
                validated during enrollment to ensure students meet the age
                requirements. For example, a teen course might require ages
                14-17.
              </p>
              <p>
                <strong className="text-foreground">
                  TDLR Instruction Method:
                </strong>{" "}
                Choose from Texas TDLR Approved methods:
              </p>
              <ul className="ml-4 space-y-1 list-disc">
                <li>
                  <strong className="text-foreground">Concurrent:</strong>{" "}
                  Classroom and behind-the-wheel instruction happen
                  simultaneously during the course.
                </li>
                <li>
                  <strong className="text-foreground">Sequential:</strong> All
                  classroom instruction must be completed before
                  behind-the-wheel training begins.
                </li>
                <li>
                  <strong className="text-foreground">None:</strong> No specific
                  instruction method requirement (for non-TDLR courses).
                </li>
              </ul>
              <p>
                <strong className="text-foreground">Required Hours:</strong> Set
                the total required classroom and drive hours to match TDLR
                regulations. The system tracks student progress against these
                requirements.
              </p>
              <p>
                <strong className="text-foreground">Active/Inactive:</strong>{" "}
                Deactivate a package to stop accepting new enrollments while
                keeping existing enrollments active. This is useful when
                retiring old course offerings.
              </p>
              <p>
                <strong className="text-foreground">Available At (Location Scope):</strong>{" "}
                Choose whether the package is offered at <em>All Locations</em>{" "}
                (school-wide) or only at <em>Specific Locations</em>. When you
                pick Specific Locations, check the locations that should sell
                the package — only those locations will see it on the storefront,
                during checkout, and in the cart. Existing packages default to
                All Locations, so nothing changes until you opt in.
              </p>
              <ul className="ml-4 space-y-1 list-disc">
                <li>
                  The hosted storefront automatically shows a location filter on
                  the Packages section when more than one active location
                  exists.
                </li>
                <li>
                  Both the single-package checkout and the cart's add-item
                  endpoint reject packages that are not allowed at the buyer's
                  selected location.
                </li>
                <li>
                  Headless integrators can pass{" "}
                  <code>?locationId=&lt;id&gt;</code> to{" "}
                  <code>/api/public/tenant/&#123;slug&#125;/packages</code> to
                  fetch only the packages available at that location (school-wide
                  packages are always included).
                </li>
              </ul>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="members" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-members"
          >
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Team Member Management</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Manage everyone who works at or attends your school — staff,
              instructors, students, and parents.
            </p>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  Inviting Members
                </h4>
                <p className="text-muted-foreground">
                  Click "Invite Member" and enter their email address. Select
                  their role (School Admin, Office Manager, Instructor, Student,
                  or Parent) and assign location access. They'll receive an
                  invitation and can set up their account.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  School Roles
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    <strong className="text-foreground">School Admin:</strong>{" "}
                    Full access to all school features — settings, members,
                    enrollments, schedule, fleet, website, and payments.
                  </p>
                  <p>
                    <strong className="text-foreground">Office Manager:</strong>{" "}
                    Manage enrollments, sessions, bookings, and view members.
                    Cannot change settings or payment configuration.
                  </p>
                  <p>
                    <strong className="text-foreground">Instructor:</strong>{" "}
                    View assigned sessions, mark attendance, manage
                    availability. Can have different instructor types
                    (Classroom, Drive, or Both) at different locations.
                  </p>
                  <p>
                    <strong className="text-foreground">Student:</strong> View
                    bookings, credit progress, and enrollment details. Usually
                    auto-created through enrollment.
                  </p>
                  <p>
                    <strong className="text-foreground">Parent:</strong> View
                    linked student's enrollment. Auto-created when a minor
                    enrolls with guardian info.
                  </p>
                </div>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Location Scope
                </h4>
                <p className="text-muted-foreground">
                  Each member can be scoped to "All Locations" or specific
                  locations using checkboxes. For instructors, you can also set
                  their instructor type (Classroom, Drive, or Both)
                  independently at each location. This allows an instructor to
                  teach classroom at one location and drive at another.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  Multi-Role Support
                </h4>
                <p className="text-muted-foreground">
                  A single person can hold multiple roles. For example, someone
                  might be both an Instructor and a Student. The member list
                  shows one row per person with all their roles displayed. Their
                  dashboard adapts to show features from their highest-privilege
                  role.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Ban className="h-4 w-4 text-muted-foreground" />
                  Disabling Members
                </h4>
                <p className="text-muted-foreground">
                  You can disable a member's access without deleting them.
                  Disabled members cannot log in or access the school's admin
                  panel, but their data (enrollments, bookings, history) is
                  preserved. You can re-enable them at any time.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="enrollments" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-enrollments"
          >
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Enrollment Workflow</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              How student enrollments flow from initial sign-up to course
              completion.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                variant="outline"
                className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
              >
                Pending
              </Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge
                variant="outline"
                className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
              >
                Pending Payment
              </Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge
                variant="outline"
                className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
              >
                Confirmed
              </Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge
                variant="outline"
                className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
              >
                In Progress
              </Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge
                variant="outline"
                className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
              >
                Completed
              </Badge>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Pending:</strong> A student
                submits an enrollment through your public website or you create
                one manually from the admin panel.
              </p>
              <p>
                <strong className="text-foreground">Pending Payment:</strong>{" "}
                The student chose to pay online. The enrollment waits for a
                successful Stripe or PayPal transaction. Abandoned payments are
                automatically cleaned up.
              </p>
              <p>
                <strong className="text-foreground">Confirmed:</strong> Payment
                is received, or you manually confirm the enrollment (e.g., for
                in-person payment). A student account is created automatically
                and linked to the enrollment.
              </p>
              <p>
                <strong className="text-foreground">In Progress:</strong> The
                student has been booked into their first session. Credits begin
                to be tracked.
              </p>
              <p>
                <strong className="text-foreground">Completed:</strong> All
                classroom and drive credits from the package have been used up.
              </p>
            </div>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Managing Enrollments
                </h4>
                <p className="text-muted-foreground">
                  The Enrollments page lets you filter by status, package,
                  location, credit usage, and date range. Click any enrollment
                  to view details, update status, add notes, or see the
                  student's credit ledger. Use the "Confirm" button to manually
                  approve pending enrollments.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  Credit Tracking
                </h4>
                <p className="text-muted-foreground">
                  Each enrollment shows remaining classroom and drive credits as
                  a progress bar. Click the credit display to open the Credit
                  Ledger dialog, which shows every transaction — bookings that
                  deducted credits, cancellations that restored them, and manual
                  adjustments.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Minor Students & Parents
                </h4>
                <p className="text-muted-foreground">
                  When a student under 18 enrolls, the enrollment form
                  automatically collects parent/guardian information (name,
                  email, phone). A parent account is created and linked to the
                  student, giving the parent visibility into the student's
                  progress.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="scheduling" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-scheduling"
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Scheduling & Bookings</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              The scheduling system handles instructor availability, session
              creation, and student booking with automatic conflict detection.
            </p>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Instructor Availability
                </h4>
                <p className="text-muted-foreground">
                  Before creating sessions, instructors (or admins) set up
                  availability windows on the Availability page. Each window
                  specifies a day of the week, start time, end time, location,
                  and session type (Classroom, Drive, or Both). These windows
                  define when an instructor can be assigned to sessions. Admins
                  can manage availability for all instructors; instructors can
                  manage their own.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Creating Sessions
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    Use the Schedule page to create sessions. The form uses
                    cascading filters to guide your selection:
                  </p>
                  <ol className="ml-4 list-decimal space-y-1">
                    <li>
                      <strong className="text-foreground">Session Type:</strong>{" "}
                      Choose Classroom or Drive.
                    </li>
                    <li>
                      <strong className="text-foreground">Instructor:</strong>{" "}
                      Only instructors qualified for that session type are
                      shown.
                    </li>
                    <li>
                      <strong className="text-foreground">Location:</strong>{" "}
                      Only locations where the selected instructor works are
                      shown.
                    </li>
                    <li>
                      <strong className="text-foreground">Vehicle:</strong> For
                      Drive sessions, only vehicles at the selected location are
                      shown.
                    </li>
                    <li>
                      <strong className="text-foreground">Date & Time:</strong>{" "}
                      Set the session date, start time, end time, and maximum
                      student capacity.
                    </li>
                  </ol>
                  <p className="mt-1">
                    The system automatically checks for conflicts — an
                    instructor or vehicle cannot be double-booked at the same
                    time.
                  </p>
                </div>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  Booking Students
                </h4>
                <p className="text-muted-foreground">
                  Click on any session to open its booking dialog. Use "Add
                  Student" to search for eligible students — those with
                  confirmed, active, or in-progress enrollments who still have
                  remaining credits for that session type. When you add a
                  student, the appropriate credits (classroom or drive) are
                  automatically deducted from their enrollment balance. The
                  enrollment status advances from "confirmed" to "in progress"
                  on the first booking.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  Filtering the Schedule
                </h4>
                <p className="text-muted-foreground">
                  Filter sessions by type (Classroom/Drive), location,
                  instructor, status (scheduled/completed/cancelled), and date
                  range. Use the location filter in the page header to quickly
                  switch between campuses.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  Cancellations
                </h4>
                <p className="text-muted-foreground">
                  When a student's booking is cancelled, their credits are
                  automatically restored to their enrollment balance. The credit
                  ledger records both the original deduction and the
                  restoration. Sessions themselves can also be cancelled, which
                  will cancel all student bookings within them.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="fleet" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-fleet"
          >
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Fleet Management</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Track and manage the vehicles used for in-car driving sessions.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Adding Vehicles:</strong>{" "}
                Click "Add Vehicle" and enter the vehicle name/label (e.g., "Car
                #1 - White Corolla"), and optionally assign it to a location.
                Add notes for any specific details.
              </p>
              <p>
                <strong className="text-foreground">Vehicle Status:</strong>{" "}
                Track each vehicle's status:
              </p>
              <ul className="ml-4 space-y-1 list-disc">
                <li>
                  <strong className="text-foreground">Active:</strong> Available
                  for scheduling drive sessions.
                </li>
                <li>
                  <strong className="text-foreground">Maintenance:</strong>{" "}
                  Temporarily out of service. Won't appear in session creation.
                </li>
                <li>
                  <strong className="text-foreground">Retired:</strong>{" "}
                  Permanently removed from the active fleet.
                </li>
              </ul>
              <p>
                <strong className="text-foreground">
                  Scheduling Integration:
                </strong>{" "}
                When creating a Drive session, only active vehicles at the
                selected location appear in the vehicle dropdown. The system
                prevents double-booking a vehicle for overlapping sessions.
              </p>
              <p>
                <strong className="text-foreground">Filtering:</strong> Filter
                your fleet list by status and location to quickly find specific
                vehicles.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="website" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-website"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">
                Your School Website — Three Approaches
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-4">
            <p className="text-sm text-muted-foreground">
              Drivorata gives you three ways to put your school online. Choose
              based on how quickly you need to launch and how much control you
              want over the design.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Approach
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Setup Time
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Hosting
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">
                      Code?
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
                    <td className="py-2 pr-4">Included</td>
                    <td className="py-2 pr-4">None</td>
                    <td className="py-2">
                      Launch immediately, no technical knowledge needed
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      2. Drivorata Assisted Website
                    </td>
                    <td className="py-2 pr-4">30–60 min</td>
                    <td className="py-2 pr-4">Drivorata Platform</td>
                    <td className="py-2 pr-4">Provide custom requirements</td>
                    <td className="py-2">
                      Custom design without hiring developers yourself
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-foreground">
                      3. Custom Developer Site
                    </td>
                    <td className="py-2 pr-4">Days–weeks</td>
                    <td className="py-2 pr-4">Any host</td>
                    <td className="py-2 pr-4">Full development</td>
                    <td className="py-2">
                      Complete design freedom, existing website
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-4 text-sm">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">
                    Approach 1 — Built-in Page Builder
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    Fastest · No code
                  </Badge>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-muted-foreground">
                    Your site is built and hosted inside Drivorata. No separate
                    project, no hosting fees, no code needed. Just open the
                    Pages section and start adding content.
                  </p>
                  <div className="space-y-2 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">
                        Getting started:
                      </strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        Go to <strong className="text-foreground">Pages</strong>{" "}
                        in your sidebar.
                      </li>
                      <li>
                        Click{" "}
                        <strong className="text-foreground">Add Page</strong> or
                        pick a{" "}
                        <strong className="text-foreground">Template</strong> —
                        6 ready-made multi-page layouts (Home, About, Packages,
                        Contact, FAQ) are available to get you started in
                        seconds.
                      </li>
                      <li>
                        Add{" "}
                        <strong className="text-foreground">Sections</strong> to
                        each page from 35 types: Hero, Packages (live from your
                        dashboard), Testimonials, FAQ, Gallery, Video, Team,
                        Timeline, Before/After, and more.
                      </li>
                      <li>
                        Customize each section — text, colors, background
                        images, button links, layout variants, and padding — all
                        visually.
                      </li>
                      <li>
                        Drag sections to reorder. Toggle visibility to hide
                        without deleting.
                      </li>
                      <li>
                        Set a{" "}
                        <strong className="text-foreground">
                          Global Header and Footer
                        </strong>{" "}
                        that appear on every page automatically.
                      </li>
                      <li>
                        Click{" "}
                        <strong className="text-foreground">Publish</strong>{" "}
                        when ready. Changes only go live after you publish —
                        previewing drafts won't affect your visitors.
                      </li>
                      <li>
                        Preview on Desktop, Tablet, and Mobile before going
                        live.
                      </li>
                    </ol>
                    <p className="mt-2">
                      <strong className="text-foreground">
                        Custom domain:
                      </strong>{" "}
                      Go to{" "}
                      <strong className="text-foreground">
                        Settings → Custom Domain
                      </strong>
                      . Enter your domain (e.g.{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        www.yourschool.com
                      </code>
                      ), add the DNS TXT record shown to your domain registrar,
                      and click Verify. Once verified, your domain serves your
                      Drivorata site automatically.
                    </p>
                    <p>
                      <strong className="text-foreground">Enrollment:</strong>{" "}
                      Your site includes an enrollment form automatically. It
                      displays your active packages and connects to your
                      Stripe/PayPal settings. Students complete payment and
                      return directly to your site.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">
                    Approach 2 — Drivorata Assisted Website
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    Custom design · Copy/paste
                  </Badge>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-muted-foreground">
                    If you want a more custom look but don't know how to code,
                    the Divorat Team can build you a complete, connected website
                    in about an hour. You connect with our team, answer a few
                    questions, and we do the rest.
                  </p>
                  <div className="space-y-1 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">
                        What we builds for you:
                      </strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>
                        A fully designed homepage with your school name,
                        packages, and a hero section
                      </li>
                      <li>
                        A schedule page showing upcoming sessions pulled live
                        from your dashboard
                      </li>
                      <li>
                        An enrollment form that sends students through Stripe or
                        PayPal and returns them to your site after payment
                      </li>
                      <li>
                        A thank-you/confirmation page that verifies the
                        enrollment automatically
                      </li>
                    </ul>
                    <p className="mt-2">
                      <strong className="text-foreground">How to do it:</strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        Go to{" "}
                        <strong className="text-foreground">
                          Settings → API Access
                        </strong>{" "}
                        and click{" "}
                        <strong className="text-foreground">
                          Generate New Key
                        </strong>
                        . Copy the key — it's shown only once.
                      </li>
                      <li>
                        Open{" "}
                        <a
                          href="https://drivorata.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          drivorata.com
                        </a>{" "}
                        and request a new website development project.
                      </li>
                      <li>
                        Drivorata team will connect with you and you supply your
                        school's slug and API key when asked.
                      </li>
                      <li>
                        Drivorata team will build and run the site for you.
                        Review it, tweak anything you want.
                      </li>
                      <li>
                        Click{" "}
                        <strong className="text-foreground">Deploy</strong> in
                        our platform to make it live. Point your domain's DNS to
                        the deployed URL.
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">
                    Approach 3 — Custom Developer Website
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    Full control · Developer needed
                  </Badge>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-muted-foreground">
                    If you have a developer, or an existing website you want to
                    connect to Drivorata, use the Public API. Your site can be
                    built on any technology — React, Next.js, WordPress,
                    Webflow, or plain HTML. Drivorata acts as the backend,
                    providing live data and handling enrollment and payment.
                  </p>
                  <div className="space-y-2 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">
                        Step 1 — Generate an API key:
                      </strong>{" "}
                      Settings → API Access → Generate New Key. Store it as an
                      environment variable (
                      <code className="bg-muted px-1 rounded text-xs">
                        DRIVORATA_API_KEY
                      </code>
                      ). You can have multiple keys (prod vs. dev) and revoke
                      them anytime.
                    </p>
                    <p>
                      <strong className="text-foreground">
                        Step 2 — Add the key to every API request:
                      </strong>
                    </p>
                    <code className="block bg-muted px-2 py-1 rounded text-xs">
                      Authorization: Bearer drv_live_...
                    </code>
                    <p className="mt-2">
                      <strong className="text-foreground">
                        Step 3 — Read your school data:
                      </strong>
                    </p>
                    <div className="bg-muted/50 rounded p-2 font-mono text-xs space-y-1">
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/your-slug/packages
                      </p>
                      <p className="pl-12 text-muted-foreground">
                        Optionally pass{" "}
                        <code>?locationId=&lt;id&gt;</code> to filter to packages
                        offered at a specific location. School-wide packages
                        (locationScopeMode = ALL_LOCATIONS) are always
                        included.
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/your-slug/locations
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/your-slug/sessions?type=CLASSROOM
                      </p>
                      <p>
                        <Badge variant="outline" className="text-xs mr-1">
                          GET
                        </Badge>
                        /api/public/tenant/your-slug/instructors
                      </p>
                    </div>
                    <p className="mt-2">
                      <strong className="text-foreground">
                        Filter packages by location (multi-location schools):
                      </strong>{" "}
                      Add a location selector to your storefront and pass the
                      visitor's chosen location ID to the packages endpoint so
                      they only see packages offered at that branch. School-wide
                      packages are always returned.
                    </p>
                    <div className="bg-muted/50 rounded p-3 font-mono text-xs space-y-2">
                      <div className="text-muted-foreground">
                        # curl example
                      </div>
                      <pre className="whitespace-pre-wrap break-all">
{`curl -H "Authorization: Bearer drv_live_..." \\
  "https://drivorata.com/api/public/tenant/your-slug/packages?locationId=12"`}
                      </pre>
                      <div className="text-muted-foreground pt-2">
                        # React + TanStack Query
                      </div>
                      <pre className="whitespace-pre-wrap break-all">
{`const { data: packages = [] } = useQuery({
  queryKey: ["packages", slug, locationId],
  queryFn: async () => {
    const url = locationId
      ? \`/api/public/tenant/\${slug}/packages?locationId=\${locationId}\`
      : \`/api/public/tenant/\${slug}/packages\`;
    const res = await fetch(url, {
      headers: { Authorization: \`Bearer \${apiKey}\` },
    });
    return res.json();
  },
});`}
                      </pre>
                    </div>
                    <p className="mt-2">
                      <strong className="text-foreground">
                        Step 4 — Handle enrollment:
                      </strong>{" "}
                      POST to{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        /api/public/tenant/your-slug/checkout/start
                      </code>{" "}
                      with student info, package ID, and payment provider.
                      Include{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        externalSuccessUrl
                      </code>{" "}
                      so students return to your website after payment. Check{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        /api/public/enrollments/:id/status
                      </code>{" "}
                      on the return to confirm the enrollment.
                    </p>
                    <p className="mt-1">
                      <strong className="text-foreground">Staff login:</strong>{" "}
                      Add a "Staff Login" link pointing to{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        https://portal.your-domain.com/login?tenant=your-slug
                      </code>
                      {" "}— use the <code className="bg-muted px-1 rounded text-xs">portal.</code> subdomain of your custom domain (it routes to Drivorata). The link should not open in a new tab. Shows your school's logo and sends staff directly to their dashboard.
                    </p>
                    <div className="mt-2">
                      <a
                        href="/api/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                        data-testid="link-school-swagger"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Full interactive API documentation — test every endpoint
                        in your browser
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="payments" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-payments"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Payment Configuration</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Set up online payment processing so students can pay during
              enrollment.
            </p>
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Stripe Setup
                </h4>
                <p className="text-muted-foreground">
                  Enter your Stripe publishable key, secret key, and webhook
                  secret. Enable Stripe as a payment method. Stripe handles
                  credit/debit card payments and provides automatic receipt
                  emails to students.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  PayPal Setup
                </h4>
                <p className="text-muted-foreground">
                  Enter your PayPal client ID and secret. Choose between Sandbox
                  (testing) and Production modes. Enable PayPal to offer it as
                  an alternative payment option alongside Stripe.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Payment Expiry
                </h4>
                <p className="text-muted-foreground">
                  Configure how long to wait before automatically cancelling
                  unpaid enrollments. The default is 24 hours. After this
                  period, abandoned "pending payment" enrollments are cleaned up
                  automatically, freeing up spots for other students.
                </p>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Manual Confirmation
                </h4>
                <p className="text-muted-foreground">
                  Not all enrollments require online payment. You can manually
                  confirm pending enrollments (e.g., for in-person cash/check
                  payments) using the "Confirm" button on the Enrollments page.
                  This bypasses the payment flow while still creating the
                  student account.
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
              <span className="font-semibold">Custom Domain</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Use your own domain name so students visit your website at your
              professional address.
            </p>
            <div className="space-y-3">
              <StepCard
                step={1}
                title="Enter Your Domain"
                icon={Globe}
                description="Go to Settings > Domain and type in your domain (e.g., www.myschool.com). The system generates a unique verification code."
              />
              <StepCard
                step={2}
                title="Add a TXT Record to Your DNS"
                icon={Shield}
                description="Log in to where you manage your domain (Cloudflare, GoDaddy, Namecheap, etc.) and add a TXT record with the verification code shown on the page. This proves you own the domain."
              />
              <StepCard
                step={3}
                title="Add a CNAME Record"
                icon={ArrowRight}
                description="Add a CNAME record pointing your domain to the platform's address. If using Cloudflare, make sure the proxy is set to 'DNS Only' (gray cloud)."
              />
              <StepCard
                step={4}
                title="Click 'Check DNS' to Verify"
                icon={CheckCircle2}
                description="Return to the Domain settings page and click 'Check DNS'. DNS changes can take up to 48 hours to take effect. Once verified, your public site and admin panel will be accessible at your custom domain."
              />
            </div>
            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Good to Know
                    </p>
                    <ul className="mt-1 space-y-1 text-amber-700 dark:text-amber-400">
                      <li>
                        Both www.yourdomain.com and yourdomain.com will work.
                      </li>
                      <li>Your admin panel will be at yourdomain.com/admin.</li>
                      <li>
                        If using Cloudflare, disable the orange cloud proxy to
                        avoid SSL issues.
                      </li>
                      <li>
                        DNS propagation typically takes a few hours but can take
                        up to 48 hours.
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="theme" className="border rounded-lg px-4">
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-theme"
          >
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Theme Customization</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Customize the look and feel of your school's public website to
              match your brand.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Brand Colors:</strong> Set
                your primary and secondary colors using the color picker in
                Settings &gt; Theme. These colors are applied to buttons, links,
                headings, and accent elements throughout your public website.
              </p>
              <p>
                <strong className="text-foreground">Live Preview:</strong> See
                color changes in real time as you adjust them, before saving.
                This helps you find the perfect color combination without trial
                and error on the live site.
              </p>
              <p>
                <strong className="text-foreground">Dark Mode Support:</strong>{" "}
                The platform automatically generates appropriate dark mode
                variants of your chosen colors, so your site looks great in both
                light and dark themes.
              </p>
              <p>
                <strong className="text-foreground">Consistency:</strong> Theme
                colors are applied consistently across all public pages, the
                enrollment form, and any embedded components, creating a
                professional and cohesive brand experience.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="external-website"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-external-website"
          >
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">
                External Website & Headless API
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Your school can have its own marketing website — separate from
              Drivorata — that displays your packages, schedule, and locations
              with your own branding. The website connects to Drivorata's API to
              read and write data in real time.
            </p>

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
                      Settings → API Access
                    </strong>{" "}
                    in your admin dashboard and click{" "}
                    <strong className="text-foreground">
                      Generate New Key
                    </strong>
                    .
                  </p>
                  <p>
                    The full key (starting with{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      drv_live_
                    </code>
                    ) is shown only once — copy it immediately and store it
                    securely as an environment variable in your website's
                    project.
                  </p>
                  <p>
                    You can generate multiple keys (e.g., one for production,
                    one for development) and revoke them individually at any
                    time.
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Step 2: Build or Connect Your Website
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>Your external website uses the Drivorata Public API to:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>
                      Display your packages, locations, and upcoming sessions
                    </li>
                    <li>
                      Let students enroll and pay (Stripe, PayPal, or Cash)
                    </li>
                    <li>
                      Redirect students back to your site after payment
                      completes
                    </li>
                  </ul>
                  <p className="mt-1">
                    All API requests require your key in the header:
                  </p>
                  <code className="block bg-muted px-2 py-1 rounded text-xs">
                    Authorization: Bearer drv_live_...
                  </code>
                  <p className="mt-1">
                    <a
                      href="/api/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                      data-testid="link-admin-api-docs"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View interactive API documentation
                    </a>{" "}
                    for full endpoint reference and live testing.
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
                    To connect your own domain (e.g.{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      sunshinedrivingschool.com
                    </code>
                    ):
                  </p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>
                      <strong className="text-foreground">
                        For your external website:
                      </strong>{" "}
                      Point your domain's DNS to wherever your website is
                      hosted. The site uses your school's slug to call the API.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        For the Drivorata admin portal:
                      </strong>{" "}
                      Go to{" "}
                      <strong className="text-foreground">
                        Settings → Custom Domain
                      </strong>
                      , enter your domain, and verify it via the DNS TXT record
                      shown. Once verified, Drivorata recognizes your domain.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Staff Login URL
                </h4>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    Your staff can log into Drivorata from a branded URL that
                    shows your school's name and logo:
                  </p>
                  <code className="block bg-muted px-2 py-1 rounded text-xs mt-1">
                    https://portal.your-domain.com/login?tenant=your-school-slug
                  </code>
                  <p className="mt-1">
                    Use the <code className="bg-muted px-1 rounded text-xs">portal.</code> subdomain of your custom domain — it routes to Drivorata so{" "}
                    <code className="bg-muted px-1 rounded text-xs">/login</code> and{" "}
                    <code className="bg-muted px-1 rounded text-xs">/admin</code> work there.
                    Your root domain stays on your public website. Share this URL with your
                    instructors and office staff; after signing in they land
                    directly in your school's admin dashboard.
                  </p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="instructor-workflow"
          className="border rounded-lg px-4"
        >
          <AccordionTrigger
            className="hover:no-underline"
            data-testid="accordion-instructor-workflow"
          >
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Instructor Workflow</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              How instructors use the system for their daily teaching
              activities.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">My Sessions:</strong>{" "}
                Instructors see their assigned sessions for today and upcoming
                days. Each session shows the type, time, location, vehicle (for
                drive), and number of booked students.
              </p>
              <p>
                <strong className="text-foreground">Student Roster:</strong>{" "}
                Click a session to see the full list of booked students. View
                each student's name, enrollment details, and contact
                information.
              </p>
              <p>
                <strong className="text-foreground">Attendance Marking:</strong>{" "}
                Mark students as present, absent, or late for each session.
                Attendance records are saved and visible to admins for
                compliance tracking.
              </p>
              <p>
                <strong className="text-foreground">
                  Availability Management:
                </strong>{" "}
                Instructors set their weekly availability from the Availability
                page. Define time blocks for each day of the week, specifying
                location and session type. Admins can see and override these
                when creating sessions.
              </p>
              <p>
                <strong className="text-foreground">Profile Completion:</strong>{" "}
                New instructors are prompted to complete their profile with
                additional details like phone number and license information
                before they can access the full system.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
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
