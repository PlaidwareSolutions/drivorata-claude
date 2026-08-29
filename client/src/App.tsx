import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { TenantProvider, useTenant } from "@/lib/tenant-context";
import { PlatformProvider, usePlatform } from "@/lib/platform-context";
import { AffiliateProvider, useAffiliate } from "@/lib/affiliate-context";
import { LocationFilterProvider, useLocationFilter } from "@/lib/location-filter-context";
import { ViewRoleProvider, useViewRole } from "@/lib/view-role-context";
import { UIContextProvider } from "@/lib/ui-context";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PlatformSidebar } from "@/components/platform-sidebar";
import { AffiliateSidebar } from "@/components/affiliate-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderControls } from "@/components/admin-header-controls";
import { HeaderRightControls } from "@/components/header-right-controls";
import { SchoolSelector } from "@/components/school-selector";
import { PreviewModeBanner } from "@/components/preview-mode-banner";
import { PlatformBackground } from "@/components/platform-background";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import LeadMagnetPage from "@/pages/lead-magnet";
import AuthPage from "@/pages/auth";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import CreateTenant from "@/pages/create-tenant";
import AdminDashboard from "@/pages/admin/dashboard";
import SettingsPage from "@/pages/admin/settings";
import LocationsPage from "@/pages/admin/locations";
import PackagesPage from "@/pages/admin/packages";
import PackageDetailPage from "@/pages/admin/package-detail";
import MembersPage from "@/pages/admin/members";
import EnrollmentsPage from "@/pages/admin/enrollments";
import VehiclesPage from "@/pages/admin/vehicles";
import AvailabilityPage from "@/pages/admin/availability";
import SchedulePage from "@/pages/admin/schedule";
import OfferingDetailPage from "@/pages/admin/offering-detail";
import StudentBookingsPage from "@/pages/admin/student-bookings";
import InstructorDashboardPage from "@/pages/admin/instructor-dashboard";
import CompleteProfilePage from "@/pages/admin/complete-profile";
import StudentDetailPage from "@/pages/admin/student-detail";
import SessionDetailPage from "@/pages/admin/session-detail";
import ReferenceGuidePage from "@/pages/admin/reference-guide";
import TicketsPage from "@/pages/admin/tickets";
import MessagesPage from "@/pages/admin/messages";
import PromotionsPage from "@/pages/admin/promotions";
import AnnouncementPage from "@/pages/admin/announcement";
import TestimonialsPage from "@/pages/admin/testimonials";
import FaqsPage from "@/pages/admin/faqs";
import OnlineCoursesPage from "@/pages/admin/online-courses";
import PlatformOverview from "@/pages/platform/overview";
import PlatformTenants from "@/pages/platform/tenants";
import PlatformTeam from "@/pages/platform/team";
import PlatformBilling from "@/pages/platform/billing";
import PlatformReferenceGuidePage from "@/pages/platform/reference-guide";
import PlatformLeadsPage from "@/pages/platform/leads";
import PlatformLeadDetailPage from "@/pages/platform/lead-detail";
import PlatformTicketsPage from "@/pages/platform/tickets";
import AffiliateProgramPage from "@/pages/affiliate-program";
import AffiliateDashboardPage from "@/pages/affiliate/dashboard";
import AffiliateReferralsPage from "@/pages/affiliate/referrals";
import AffiliateCommissionsPage from "@/pages/affiliate/commissions";
import AffiliatePayoutsPage from "@/pages/affiliate/payouts";
import PlatformMarketingSettingsPage from "@/pages/platform/marketing-settings";
import PlatformAffiliatesPage from "@/pages/platform/affiliates";
import PlatformTenantDetail from "@/pages/platform/tenant-detail";

function PlatformLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <UIContextProvider context="platform">
      <PlatformBackground />
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <PlatformSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-4 p-2 border-b sticky top-0 z-50 bg-background">
              <SidebarTrigger data-testid="button-platform-sidebar-toggle" />
              <HeaderRightControls />
            </header>
            <main className="flex-1 overflow-auto">
              <Switch>
                <Route path="/platform/tenants/:id" component={PlatformTenantDetail} />
                <Route path="/platform/tenants" component={PlatformTenants} />
                <Route path="/platform/team" component={PlatformTeam} />
                <Route path="/platform/billing" component={PlatformBilling} />
                <Route path="/platform/leads/:id" component={PlatformLeadDetailPage} />
                <Route path="/platform/leads" component={PlatformLeadsPage} />
                <Route path="/platform/tickets" component={PlatformTicketsPage} />
                <Route path="/platform/marketing-settings" component={PlatformMarketingSettingsPage} />
                <Route path="/platform/affiliates" component={PlatformAffiliatesPage} />
                <Route path="/platform/guide" component={PlatformReferenceGuidePage} />
                <Route path="/platform" component={PlatformOverview} />
                <Route component={PlatformOverview} />
              </Switch>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </UIContextProvider>
  );
}

const isPortalMode = typeof window !== "undefined" && window.location.hostname.startsWith("portal.");

interface PlatformTenantItem {
  id: number;
  name: string;
  slug: string;
  active: boolean;
}

function SchoolPickerEmptyState() {
  const { tenants, setCurrentTenantId } = useTenant();
  const { isPlatformMember, enterTenant } = usePlatform();
  const [, setLocation] = useLocation();

  const { data: allTenants } = useQuery<PlatformTenantItem[]>({
    queryKey: ["/api/platform/tenants"],
    enabled: isPlatformMember,
    select: (data: any[]) =>
      data.map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, active: t.active })),
  });

  const schoolList: PlatformTenantItem[] = isPlatformMember
    ? (allTenants || [])
    : tenants.map((t) => ({ id: t.tenant.id, name: t.tenant.name, slug: t.tenant.slug, active: true }));

  const handleSelect = (tenantId: number) => {
    if (isPlatformMember) {
      enterTenant(tenantId);
    } else {
      setCurrentTenantId(tenantId);
    }
    setLocation("/admin");
  };

  const buildingIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
  );

  const isSingle = schoolList.length === 1;

  return (
    <div className="flex items-start justify-center min-h-full p-8">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
            {buildingIcon}
          </div>
          <h2 className="text-xl font-semibold mb-2" data-testid="text-school-picker-heading">
            {isSingle ? "Enter your school" : "Pick a school to get started"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {schoolList.length === 0
              ? "You don't have access to any schools yet."
              : isSingle
                ? "Click below to open your school's dashboard."
                : "Select one of the schools you have access to. You can switch any time from the header."}
          </p>
        </div>

        {schoolList.length > 0 && (
          <div className={isSingle ? "flex justify-center" : "grid gap-3 sm:grid-cols-2"}>
            {schoolList.map((school) => (
              <button
                key={school.id}
                onClick={() => handleSelect(school.id)}
                data-testid={`button-select-school-${school.id}`}
                className={
                  isSingle
                    ? "flex items-center gap-3 px-6 py-4 rounded-lg border bg-card hover-elevate active-elevate-2 text-left min-w-[260px]"
                    : "flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover-elevate active-elevate-2 text-left"
                }
              >
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{school.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{school.slug}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminLayout() {
  const { isLoading: tenantsLoading, tenants, currentTenant } = useTenant();
  const { isPlatformMember } = usePlatform();
  const [location, setLocation] = useLocation();

  const tenantId = currentTenant?.tenant.id;
  const { data: profileData } = useQuery<{ needsCompletion: boolean }>({
    queryKey: ["/api/tenants", tenantId, "my-profile"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/my-profile`, { credentials: "include" });
      if (!res.ok) return { needsCompletion: false };
      return res.json();
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (profileData?.needsCompletion && location !== "/admin/my-profile") {
      setLocation("/admin/my-profile");
    }
  }, [profileData?.needsCompletion, location, setLocation]);

  if (tenantsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (tenants.length === 0 && !isPlatformMember) {
    return <CreateTenant />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <UIContextProvider context="school">
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-4 px-3 py-2 border-b sticky top-0 z-50 bg-background">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                {!isPortalMode && <SchoolSelector />}
                {currentTenant && <AdminHeaderControls />}
              </div>
              <HeaderRightControls />
            </header>
            {currentTenant?.tenant?.previewMode && <PreviewModeBanner />}
            <main className="flex-1 overflow-auto">
              {!currentTenant ? (
              <Switch>
                <Route path="/admin/guide" component={ReferenceGuidePage} />
                <Route>
                  <SchoolPickerEmptyState />
                </Route>
              </Switch>
            ) : (
              <Switch>
                <Route path="/admin/settings" component={SettingsPage} />
                <Route path="/admin/locations" component={LocationsPage} />
                <Route path="/admin/packages/:id" component={PackageDetailPage} />
                <Route path="/admin/packages" component={PackagesPage} />
                <Route path="/admin/online-courses" component={OnlineCoursesPage} />
                <Route path="/admin/members" component={MembersPage} />
                <Route path="/admin/enrollments" component={EnrollmentsPage} />
                <Route path="/admin/vehicles" component={VehiclesPage} />
                <Route path="/admin/instructor-availability" component={AvailabilityPage} />
                <Route path="/admin/availability">
                  {() => { window.location.replace("/admin/instructor-availability" + window.location.search); return null; }}
                </Route>
                <Route path="/admin/students/:userId" component={StudentDetailPage} />
                <Route path="/admin/packages/:id/cohorts/:cid/sessions/:sid" component={SessionDetailPage} />
                <Route path="/admin/packages/:id/cohorts/:cid" component={OfferingDetailPage} />
                <Route path="/admin/sessions/:sessionId">
                  {(p) => <LegacySessionRedirect sessionId={p.sessionId} />}
                </Route>
                <Route path="/admin/calendar" component={SchedulePage} />
                <Route path="/admin/schedule-sessions">
                  {() => { window.location.replace("/admin/calendar" + window.location.search); return null; }}
                </Route>
                <Route path="/admin/schedule">
                  {() => { window.location.replace("/admin/calendar" + window.location.search); return null; }}
                </Route>
                <Route path="/admin/schedule-offerings/:oid">
                  {(p) => <LegacyOfferingRedirect offeringId={p.oid} />}
                </Route>
                <Route path="/admin/schedule-offerings">
                  {() => { window.location.replace("/admin/packages"); return null; }}
                </Route>
                <Route path="/admin/my-bookings" component={StudentBookingsPage} />
                <Route path="/admin/my-sessions" component={InstructorDashboardPage} />
                <Route path="/admin/my-profile" component={CompleteProfilePage} />
                <Route path="/admin/promotions" component={PromotionsPage} />
                <Route path="/admin/announcement" component={AnnouncementPage} />
                <Route path="/admin/testimonials" component={TestimonialsPage} />
                <Route path="/admin/faqs" component={FaqsPage} />
                <Route path="/admin/tickets" component={TicketsPage} />
                <Route path="/admin/messages" component={MessagesPage} />
                <Route path="/admin/messages/:id" component={MessagesPage} />
                <Route path="/admin/guide" component={ReferenceGuidePage} />
                <Route path="/admin" component={AdminDashboard} />
                <Route component={AdminDashboard} />
              </Switch>
            )}
          </main>
        </div>
      </div>
      </SidebarProvider>
    </UIContextProvider>
  );
}

function AffiliateLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <UIContextProvider context="platform">
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AffiliateSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-4 p-2 border-b sticky top-0 z-50 bg-background">
              <SidebarTrigger data-testid="button-affiliate-sidebar-toggle" />
              <HeaderRightControls />
            </header>
            <main className="flex-1 overflow-auto">
              <Switch>
                <Route path="/affiliate/referrals" component={AffiliateReferralsPage} />
                <Route path="/affiliate/commissions" component={AffiliateCommissionsPage} />
                <Route path="/affiliate/payouts" component={AffiliatePayoutsPage} />
                <Route path="/affiliate" component={AffiliateDashboardPage} />
                <Route component={AffiliateDashboardPage} />
              </Switch>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </UIContextProvider>
  );
}

function AppRouter() {
  const { isPlatformMember, isLoading: platformLoading, viewMode } = usePlatform();
  const { isAffiliate, isLoading: affiliateLoading } = useAffiliate();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!platformLoading && !affiliateLoading) {
      if (location === "/admin" && viewMode === "platform" && isPlatformMember) {
        setLocation("/platform");
      }
      if (location === "/admin" && !isPlatformMember && isAffiliate) {
        setLocation("/affiliate");
      }
    }
  }, [platformLoading, affiliateLoading, isPlatformMember, isAffiliate, location, viewMode, setLocation]);

  if (location.startsWith("/affiliate")) {
    if (affiliateLoading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <Skeleton className="h-8 w-48" />
        </div>
      );
    }
    if (!isAffiliate) {
      setLocation("/admin");
      return null;
    }
    return <AffiliateLayout />;
  }

  if (location.startsWith("/platform")) {
    if (platformLoading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <Skeleton className="h-8 w-48" />
        </div>
      );
    }
    if (!isPlatformMember) {
      setLocation("/admin");
      return null;
    }
    return <PlatformLayout />;
  }

  return (
    <TenantProvider>
      <LocationFilterProvider>
        <ViewRoleProvider>
          <AdminLayout />
        </ViewRoleProvider>
      </LocationFilterProvider>
    </TenantProvider>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <PlatformProvider>
      <AffiliateProvider>
        <AppRouter />
      </AffiliateProvider>
    </PlatformProvider>
  );
}

// A "custom domain" is a school's own domain pointed at the app. Everything
// else — local dev, the Railway-provided hostname, the platform domain and
// staff-portal subdomains — renders the platform experience.
function isCustomDomain(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  if (hostname.endsWith(".railway.app")) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) return false;
  const platformDomain = (import.meta.env.VITE_PLATFORM_DOMAIN || "").toLowerCase();
  if (platformDomain && (hostname === platformDomain || hostname === `www.${platformDomain}`)) return false;
  if (hostname.startsWith("portal.")) return false;
  return true;
}

function LegacyOfferingRedirect({ offeringId }: { offeringId: string }) {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant?.id;
  const { data, isLoading, error } = useQuery<any>({
    queryKey: tenantId ? [`/api/tenants/${tenantId}/schedule-offerings/${offeringId}`] : ["__legacy-offering-skip"],
    enabled: !!tenantId,
  });
  if (error || (!isLoading && data && !data.packageId)) {
    window.location.replace("/admin/calendar?manageOfferings=1");
    return null;
  }
  if (data?.packageId) {
    window.location.replace(`/admin/packages/${data.packageId}/cohorts/${offeringId}${window.location.search}${window.location.hash}`);
    return null;
  }
  return (
    <div className="flex items-center justify-center h-screen">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

function LegacySessionRedirect({ sessionId }: { sessionId: string }) {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant?.id;
  const { data: sessionDetail, isLoading: sLoading, error: sErr } = useQuery<any>({
    queryKey: tenantId ? [`/api/tenants/${tenantId}/sessions/${sessionId}/detail`] : ["__legacy-session-skip"],
    enabled: !!tenantId,
  });
  const session = sessionDetail?.session;
  const offeringId = session?.offeringId;
  const { data: offering, isLoading: oLoading, error: oErr } = useQuery<any>({
    queryKey: tenantId && offeringId ? [`/api/tenants/${tenantId}/schedule-offerings/${offeringId}`] : ["__legacy-session-offering-skip"],
    enabled: !!tenantId && !!offeringId,
  });
  if (sErr || oErr || (!sLoading && session && !offeringId) || (!oLoading && offering && !offering.packageId)) {
    window.location.replace("/admin/calendar");
    return null;
  }
  if (offering?.packageId && offeringId) {
    window.location.replace(`/admin/packages/${offering.packageId}/cohorts/${offeringId}/sessions/${sessionId}${window.location.search}${window.location.hash}`);
    return null;
  }
  return (
    <div className="flex items-center justify-center h-screen">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

function CustomDomainRouter() {
  const { data: resolved, isLoading, error } = useQuery({
    queryKey: ["/api/public/resolve", window.location.hostname],
    queryFn: async () => {
      const res = await fetch(`/api/public/resolve?hostname=${encodeURIComponent(window.location.hostname)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!resolved?.slug) {
    return <Landing />;
  }

  return <Landing />;
}

function Router() {
  if (isCustomDomain()) {
    return (
      <Switch>
        <Route path="/login" component={AuthPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/platform/*?">{() => <AuthenticatedApp />}</Route>
        <Route path="/affiliate-program" component={AffiliateProgramPage} />
        <Route path="/affiliate/*?">{() => <AuthenticatedApp />}</Route>
        <Route path="/admin/*?">{() => <AuthenticatedApp />}</Route>
        <Route path="/*?" component={CustomDomainRouter} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/platform/*?">{() => <AuthenticatedApp />}</Route>
      <Route path="/affiliate-program" component={AffiliateProgramPage} />
      <Route path="/affiliate/*?">{() => <AuthenticatedApp />}</Route>
      <Route path="/admin/*?">{() => <AuthenticatedApp />}</Route>
      <Route path="/" component={LeadMagnetPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Toaster />
          <Router />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
