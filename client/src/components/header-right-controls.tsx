import { Eye, Moon, Sun, Monitor, Inbox } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useViewRole } from "@/lib/view-role-context";
import { useTheme } from "@/lib/theme-provider";
import { useTenant } from "@/lib/tenant-context";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const roleLabels: Record<string, string> = {
  platform_admin: "Platform Admin",
  platform_support: "Platform Support",
  tenant_admin: "School Admin",
  office_manager: "Office Manager",
  instructor: "Instructor",
  student: "Student",
  parent: "Parent",
};

export function HeaderRightControls() {
  const { availableViews, selectedMemberRole, setSelectedMemberRole } = useViewRole();
  const { mode, setMode, theme } = useTheme();
  const { currentTenant } = useTenant();

  const userRoles = currentTenant?.roles ?? (currentTenant ? [currentTenant.role] : []);
  const tenantId = currentTenant?.tenant?.id;
  const isAdmin = userRoles.some((r) => r === "tenant_admin" || r === "office_manager" || r === "platform_admin");

  const { data: unreadMessagesCount } = useQuery<{ count: number }>({
    queryKey: ["/api/tenants", tenantId, "contact-submissions", "unread-count"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/contact-submissions/unread-count`, { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!tenantId && isAdmin,
    refetchInterval: 60_000,
  });
  const unreadMessages = unreadMessagesCount?.count || 0;

  const cycleTheme = () => {
    if (mode === "light") setMode("dark");
    else if (mode === "dark") setMode("system");
    else setMode("light");
  };

  const ThemeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {userRoles.length > 0 && (
        <div className="flex items-center gap-1 mr-1" data-testid="user-roles-display">
          {userRoles.map((r) => (
            <Badge key={r} variant="outline" className="text-xs hidden sm:flex" data-testid={`badge-user-role-${r}`}>
              {roleLabels[r] || r}
            </Badge>
          ))}
        </div>
      )}

      {availableViews.length > 1 && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  data-testid="button-view-role"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>View as role</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" data-testid="menu-view-role">
            <DropdownMenuLabel>View as</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={selectedMemberRole || ""} onValueChange={(v) => setSelectedMemberRole(v as any)}>
              {availableViews.map((v) => (
                <DropdownMenuRadioItem
                  key={v.value}
                  value={v.value}
                  data-testid={`select-view-${v.value}`}
                >
                  {v.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {tenantId && isAdmin && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="relative h-8 w-8"
              data-testid="button-messages-inbox"
            >
              <Link href="/admin/messages" aria-label="Messages">
                <Inbox className="h-4 w-4" />
                {unreadMessages > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-semibold min-w-[16px] h-[16px] px-1"
                    data-testid="badge-messages-unread"
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Messages{unreadMessages > 0 ? ` (${unreadMessages} unread)` : ""}</p>
          </TooltipContent>
        </Tooltip>
      )}

      <NotificationBell />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={cycleTheme}
            data-testid="button-appearance-toggle"
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Appearance: {mode}</p>
        </TooltipContent>
      </Tooltip>

    </div>
  );
}
