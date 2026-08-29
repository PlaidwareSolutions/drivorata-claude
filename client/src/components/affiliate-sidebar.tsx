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
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Wallet,
  HelpCircle,
  LogOut,
  Globe,
  Building2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePlatform } from "@/lib/platform-context";
import { cn } from "@/lib/utils";
import plaidwareLogo from "@assets/image_1771795219703.png";

export function AffiliateSidebar() {
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();
  const { setOpenMobile } = useSidebar();
  const { isPlatformMember, setViewMode, clearEnteredTenant, setPendingSchoolPicker } = usePlatform();

  const affiliateItems = [
    { title: "Dashboard", url: "/affiliate", icon: LayoutDashboard },
    { title: "Referrals", url: "/affiliate/referrals", icon: Users },
    { title: "Commissions", url: "/affiliate/commissions", icon: DollarSign },
    { title: "Payouts", url: "/affiliate/payouts", icon: Wallet },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Drivorata" className="h-10 w-10" />
          <span className="font-bold text-xl">Drivorata</span>
        </div>
        {isPlatformMember && (
          <div className="flex mt-3 bg-muted rounded-lg p-1" data-testid="affiliate-nav-toggle">
            <button
              className={cn(
                "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors",
                "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setViewMode("platform");
                setLocation("/platform");
                setOpenMobile(false);
              }}
              data-testid="toggle-platform-view"
            >
              <Globe className="h-3 w-3 inline-block mr-1" />
              Platform
            </button>
            <button
              className={cn(
                "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors",
                "bg-primary text-primary-foreground shadow-sm"
              )}
              data-testid="toggle-affiliate-view"
            >
              <DollarSign className="h-3 w-3 inline-block mr-1" />
              Affiliate
            </button>
            <button
              className={cn(
                "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors",
                "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                clearEnteredTenant();
                setViewMode("school");
                setPendingSchoolPicker(true);
                setLocation("/admin");
                setOpenMobile(false);
              }}
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
          <SidebarGroupLabel>Affiliate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {affiliateItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url || (item.url !== "/affiliate" && location.startsWith(item.url))}
                  >
                    <Link
                      href={item.url}
                      onClick={() => setOpenMobile(false)}
                      data-testid={`link-affiliate-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild data-active={location === "/affiliate/guide"}>
              <Link href="/admin/guide" onClick={() => setOpenMobile(false)} data-testid="link-affiliate-reference-guide">
                <HelpCircle className="h-4 w-4" />
                <span>Reference Guide</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => { setOpenMobile(false); logout(); }}
              data-testid="button-affiliate-logout"
              className="text-destructive hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center justify-center px-2">
          <img src={plaidwareLogo} alt="Plaidware" className="w-full max-w-[10rem] object-contain" data-testid="img-plaidware-logo" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
