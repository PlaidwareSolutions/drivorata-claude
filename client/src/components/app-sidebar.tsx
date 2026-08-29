import { useState } from "react";
import plaidwareLogo from "@assets/image_1771795219703.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Settings,
  MapPin,
  Package,
  Users,
  Globe,
  GraduationCap,
  Car,
  Clock,
  Calendar,
  BookOpen,
  Building2,
  HelpCircle,
  LogOut,
  DollarSign,
  MessageSquarePlus,
  Send,
  Bug,
  Lightbulb,
  Palette,
  FileEdit,
  MoreHorizontal,
  X,
  Tag,
  Megaphone,
  MessageSquareQuote,
  Monitor,
  UserCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { usePlatform } from "@/lib/platform-context";
import { useAffiliate } from "@/lib/affiliate-context";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const adminRoles = ["platform_admin", "tenant_admin", "office_manager"];
const instructorRoles = ["platform_admin", "tenant_admin", "instructor"];
const studentRoles = ["platform_admin", "tenant_admin", "student"];

const isPortalMode = typeof window !== "undefined" && window.location.hostname.startsWith("portal.");

const feedbackCategories = [
  { value: "bug", label: "Bug report", icon: Bug },
  { value: "feature_request", label: "Feature request", icon: Lightbulb },
  { value: "design", label: "Design", icon: Palette },
  { value: "content", label: "Content", icon: FileEdit },
  { value: "other", label: "Other", icon: MoreHorizontal },
] as const;

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { currentTenant, hasAnyRole } = useTenant();
  const { isPlatformMember, viewMode, exitTenant, clearEnteredTenant, setViewMode, setPendingSchoolPicker } = usePlatform();
  const { isAffiliate } = useAffiliate();
  const { setOpenMobile } = useSidebar();
  const { logout, user } = useAuth();
  const { toast } = useToast();

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<string>("bug");
  const [feedbackText, setFeedbackText] = useState("");

  const isAdmin = hasAnyRole(...adminRoles);
  const isInstructor = hasAnyRole(...instructorRoles);
  const isStudent = hasAnyRole(...studentRoles);

  const tenantId = currentTenant?.tenant.id;

  const { data: pendingCashCount } = useQuery<{ count: number }>({
    queryKey: ["/api/tenants", tenantId, "pending-cash-payments", "count"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/pending-cash-payments/count`, { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!tenantId && isAdmin,
    refetchInterval: 60_000,
  });

  const feedbackMutation = useMutation({
    mutationFn: async (data: { type: string; description: string }) => {
      return apiRequest("POST", `/api/tenants/${tenantId}/tickets`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", tenantId, "tickets"],
      });
      setFeedbackOpen(false);
      setFeedbackType("bug");
      setFeedbackText("");
      toast({ title: "Feedback submitted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to submit feedback", variant: "destructive" });
    },
  });

  const handleFeedbackSubmit = () => {
    if (!feedbackText.trim()) return;
    feedbackMutation.mutate({
      type: feedbackType,
      description: feedbackText.trim(),
    });
  };

  const managementItems = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard, show: true },
    { title: "Packages", url: "/admin/packages", icon: Package, show: isAdmin },
    { title: "Calendar", url: "/admin/calendar", icon: Calendar, show: isAdmin || isInstructor },
    { title: "Online Courses", url: "/admin/online-courses", icon: Monitor, show: isAdmin },
    { title: "Enrollments", url: "/admin/enrollments", icon: GraduationCap, show: isAdmin },
    { title: "Instructors", url: "/admin/instructor-availability", icon: Clock, show: isAdmin || isInstructor },
    { title: "Vehicles", url: "/admin/vehicles", icon: Car, show: isAdmin },
    { title: "Members", url: "/admin/members", icon: Users, show: isAdmin },
    { title: "Promotions", url: "/admin/promotions", icon: Tag, show: isAdmin },
    { title: "Announcements", url: "/admin/announcement", icon: Megaphone, show: isAdmin },
    { title: "Locations", url: "/admin/locations", icon: MapPin, show: isAdmin },
    { title: "Testimonials", url: "/admin/testimonials", icon: MessageSquareQuote, show: isAdmin && currentTenant?.tenant.websiteEnabled !== false },
  { title: "FAQs", url: "/admin/faqs", icon: HelpCircle, show: isAdmin && currentTenant?.tenant.websiteEnabled !== false },
  ].filter((item) => item.show);


  const handleSwitchToPlatform = () => {
    exitTenant();
    setLocation("/platform");
    setOpenMobile(false);
  };

  const handleSwitchToSchoolView = () => {
    clearEnteredTenant();
    setViewMode("school");
    setPendingSchoolPicker(true);
    setLocation("/admin");
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        {isPortalMode && currentTenant ? (
          <div className="flex items-center gap-2" data-testid="sidebar-school-name">
            {currentTenant.tenant.logoUrl ? (
              <img src={currentTenant.tenant.logoUrl} alt={currentTenant.tenant.name} className="h-10 w-10 rounded object-contain" />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground shrink-0" />
            )}
            <span className="font-bold text-lg leading-tight">{currentTenant.tenant.name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Drivorata" className="h-10 w-10" />
            <span className="font-bold text-xl">Drivorata</span>
          </div>
        )}
        {isPlatformMember && (
          <div className="flex mt-3 bg-muted rounded-lg p-1" data-testid="platform-school-toggle">
            <button
              className={cn(
                "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors",
                viewMode === "platform"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={handleSwitchToPlatform}
              data-testid="toggle-platform-view"
            >
              <Globe className="h-3 w-3 inline-block mr-1" />
              Platform
            </button>
            <button
              className={cn(
                "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors",
                viewMode === "school"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={handleSwitchToSchoolView}
              data-testid="toggle-school-view"
            >
              <Building2 className="h-3 w-3 inline-block mr-1" />
              School
            </button>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        {currentTenant && (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {managementItems.map((item) => {
                    const total = item.url === "/admin/enrollments"
                      ? (pendingCashCount?.count || 0)
                      : 0;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild data-active={location === item.url || (item.url === "/admin/packages" && (location.startsWith("/admin/packages/") || location.startsWith("/admin/sessions/")))}>
                          <Link
                            href={item.url}
                            onClick={() => setOpenMobile(false)}
                            data-testid={item.title === "Calendar" ? "link-calendar" : `link-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                          >
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">{item.title}</span>
                            {total > 0 && (
                              <span
                                className="ml-auto inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-semibold min-w-[18px] h-[18px] px-1"
                                data-testid="pill-enrollment-attention"
                              >
                                {total}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        {isAdmin && currentTenant && (
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-1">
                <SidebarMenuButton
                  asChild
                  data-active={location === "/admin/settings"}
                  className="flex-1"
                >
                  <Link
                    href="/admin/settings"
                    onClick={() => setOpenMobile(false)}
                    data-testid="link-school-settings"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/admin/guide"}
                  className="flex-1"
                >
                  <Link
                    href="/admin/guide"
                    onClick={() => setOpenMobile(false)}
                    data-testid="link-reference-guide"
                  >
                    <HelpCircle className="h-4 w-4" />
                    <span>Guide</span>
                  </Link>
                </SidebarMenuButton>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        {isAffiliate && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link
                  href="/affiliate"
                  onClick={() => setOpenMobile(false)}
                  data-testid="link-affiliate-dashboard"
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Affiliate Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <SidebarMenu>
          {!(isAdmin && currentTenant) && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild data-active={location === "/admin/guide"}>
                <Link href="/admin/guide" onClick={() => setOpenMobile(false)} data-testid="link-reference-guide">
                  <HelpCircle className="h-4 w-4" />
                  <span>Reference Guide</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <div className="flex items-center gap-1">
              <SidebarMenuButton
                onClick={() => { setOpenMobile(false); logout(); }}
                data-testid="button-sidebar-logout"
                className="flex-1 text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span>Log out</span>
              </SidebarMenuButton>
              {user && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      data-active={location === "/admin/my-profile"}
                      data-testid="link-my-profile"
                      aria-label="My Profile"
                      className="!w-8 !h-8 !p-0 shrink-0 flex items-center justify-center"
                    >
                      <Link href="/admin/my-profile" onClick={() => setOpenMobile(false)}>
                        <UserCircle className="h-4 w-4" />
                        <span className="sr-only">My Profile</span>
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-sm font-medium" data-testid="text-profile-tooltip-name">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-profile-tooltip-email">
                      {user.email}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
              {currentTenant && (
                <SidebarMenuButton
                  onClick={() => {
                    setOpenMobile(false);
                    setFeedbackOpen(true);
                  }}
                  data-testid="button-share-feedback"
                  aria-label="Share Feedback"
                  title="Share Feedback"
                  className="!w-8 !h-8 !p-0 shrink-0 flex items-center justify-center"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  <span className="sr-only">Share Feedback</span>
                </SidebarMenuButton>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        {isPortalMode ? (
          <div className="flex flex-col items-center gap-1 px-2">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Drivorata" className="h-8 w-8 shrink-0" />
              <span className="text-base font-bold tracking-wide">DRIVORATA</span>
            </div>
            <span className="text-[10px] text-muted-foreground">powered by</span>
            <img src={plaidwareLogo} alt="Plaidware" className="max-w-[5rem] object-contain" data-testid="img-plaidware-logo" />
          </div>
        ) : (
          <div className="flex items-center justify-center px-2">
            <img src={plaidwareLogo} alt="Plaidware" className="w-full max-w-[10rem] object-contain" data-testid="img-plaidware-logo" />
          </div>
        )}
      </SidebarFooter>

      <Dialog
        open={feedbackOpen}
        onOpenChange={(open) => {
          setFeedbackOpen(open);
          if (!open) {
            setFeedbackType("bug");
            setFeedbackText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-feedback-dialog-title">Share your feedback</DialogTitle>
            <DialogDescription className="sr-only">Submit a bug report, feature request, or other feedback</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" data-testid="feedback-category-buttons">
              {feedbackCategories.map((cat) => {
                const isSelected = feedbackType === cat.value;
                return (
                  <Button
                    key={cat.value}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFeedbackType(cat.value)}
                    data-testid={`button-feedback-category-${cat.value}`}
                  >
                    <cat.icon className="h-3.5 w-3.5 mr-1.5" />
                    {cat.label}
                  </Button>
                );
              })}
            </div>
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Add feedback here..."
              className="resize-none min-h-[120px]"
              data-testid="input-feedback-description"
            />
            <Button
              className="w-full"
              onClick={handleFeedbackSubmit}
              disabled={feedbackMutation.isPending || !feedbackText.trim()}
              data-testid="button-submit-feedback"
            >
              <Send className="h-4 w-4 mr-2" />
              {feedbackMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
            <div className="flex justify-center pt-1">
              <Link
                href="/admin/tickets"
                onClick={() => {
                  setFeedbackOpen(false);
                  setOpenMobile(false);
                }}
                className="text-sm text-primary underline-offset-4 hover:underline"
                data-testid="link-my-feedback"
              >
                View My Feedback
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
