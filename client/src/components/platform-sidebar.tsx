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
} from "@/components/ui/sidebar";
import {
  Globe,
  Users,
  LayoutDashboard,
  CreditCard,
  Building2,
  HelpCircle,
  Target,
  MessageSquare,
  Megaphone,
  Settings,
  UserPlus,
  LogOut,
  UserCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePlatform } from "@/lib/platform-context";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import plaidwareLogo from "@assets/image_1771795219703.png";
export function PlatformSidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { viewMode, setViewMode, isPlatformMember, clearEnteredTenant, setPendingSchoolPicker } = usePlatform();
  const { setOpenMobile } = useSidebar();

  const platformItems = [
    { title: "Overview", url: "/platform", icon: Globe },
    { title: "Tenants", url: "/platform/tenants", icon: Building2 },
    { title: "Platform Team", url: "/platform/team", icon: Users },
    { title: "Billing", url: "/platform/billing", icon: CreditCard },
    { title: "Leads", url: "/platform/leads", icon: Target },
    { title: "Tickets", url: "/platform/tickets", icon: MessageSquare },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Drivorata" className="h-10 w-10" />
          <span className="font-bold text-xl">Drivorata</span>
        </div>
        {isPlatformMember && (
          <div className="flex mt-3 bg-muted rounded-lg p-1" data-testid="platform-school-toggle">
            <button
              className={cn(
                "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors",
                viewMode === "platform"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("platform")}
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
              onClick={() => { clearEnteredTenant(); setViewMode("school"); setPendingSchoolPicker(true); setLocation("/admin"); setOpenMobile(false); }}
              data-testid="toggle-school-view"
            >
              <Building2 className="h-3 w-3 inline-block mr-1" />
              School
            </button>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url || (item.url !== "/platform" && location.startsWith(item.url))}
                  >
                    <Link href={item.url} onClick={() => setOpenMobile(false)} data-testid={`link-platform-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Marketing</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/platform/affiliates" || location.startsWith("/platform/affiliates/")}
                >
                  <Link href="/platform/affiliates" onClick={() => setOpenMobile(false)} data-testid="link-platform-affiliates">
                    <UserPlus className="h-4 w-4" />
                    <span>Affiliates</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/platform/marketing-settings"}
                >
                  <Link href="/platform/marketing-settings" onClick={() => setOpenMobile(false)} data-testid="link-platform-marketing-settings">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              data-active={location === "/platform/guide"}
            >
              <Link href="/platform/guide" onClick={() => setOpenMobile(false)} data-testid="link-reference-guide">
                <HelpCircle className="h-4 w-4" />
                <span>Reference Guide</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="flex items-center gap-1">
              <SidebarMenuButton
                onClick={() => { setOpenMobile(false); logout(); }}
                data-testid="button-platform-logout"
                className="flex-1 text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span>Log out</span>
              </SidebarMenuButton>
              {user && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      aria-label="Logged in user"
                      data-testid="button-platform-user-info"
                      className="!w-8 !h-8 !p-0 shrink-0 flex items-center justify-center"
                    >
                      <UserCircle className="h-4 w-4" />
                      <span className="sr-only">User info</span>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-sm font-medium" data-testid="text-platform-tooltip-name">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-platform-tooltip-email">
                      {user.email}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center justify-center px-2">
          <img src={plaidwareLogo} alt="Plaidware" className="w-full max-w-[10rem] object-contain" data-testid="img-plaidware-logo" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
