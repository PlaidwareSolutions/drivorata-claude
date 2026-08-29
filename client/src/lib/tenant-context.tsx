import { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { usePlatform } from "@/lib/platform-context";
import type { Tenant, TenantMember } from "@shared/schema";

type TenantMemberWithRoles = TenantMember & { tenant: Tenant; roles: string[] };

interface TenantContextType {
  currentTenant: TenantMemberWithRoles | null;
  tenants: TenantMemberWithRoles[];
  setCurrentTenantId: (id: number) => void;
  isLoading: boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (...roles: string[]) => boolean;
}

const TenantContext = createContext<TenantContextType>({
  currentTenant: null,
  tenants: [],
  setCurrentTenantId: () => {},
  isLoading: true,
  hasRole: () => false,
  hasAnyRole: () => false,
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { isPlatformMember, platformRole, enteredTenantId } = usePlatform();
  const [currentTenantId, setCurrentTenantId] = useState<number | null>(() => {
    const saved = localStorage.getItem("currentTenantId");
    return saved ? parseInt(saved, 10) : null;
  });

  const { data: tenants = [], isLoading } = useQuery<TenantMemberWithRoles[]>({
    queryKey: ["/api/tenants"],
    enabled: isAuthenticated,
  });

  const membershipTenant = tenants.find((t) => t.tenant.id === enteredTenantId);
  const needsPlatformFetch = isPlatformMember && !!enteredTenantId && !membershipTenant;

  const { data: platformTenant } = useQuery<Tenant>({
    queryKey: ["/api/platform/tenants", enteredTenantId],
    enabled: needsPlatformFetch,
  });

  useEffect(() => {
    // The platform "enter tenant" feature is only meaningful for platform
    // members. A stale `platformEnteredTenantId` left in localStorage from a
    // prior platform-admin session must NOT clobber a normal tenant member's
    // selection — that bug made the school picker click do nothing because
    // this effect kept resetting currentTenantId on every render.
    if (isPlatformMember && enteredTenantId) {
      setCurrentTenantId(enteredTenantId);
      return;
    }
    if (isPlatformMember && !enteredTenantId && currentTenantId) {
      setCurrentTenantId(null);
      return;
    }
    if (!isPlatformMember && tenants.length > 0) {
      // Snap to the first membership when there's no selection, OR when the
      // current selection points at a tenant the user no longer belongs to
      // (e.g. removed membership, leftover localStorage from a prior account).
      const stillMember = currentTenantId != null && tenants.some((t) => t.tenant.id === currentTenantId);
      if (!currentTenantId || !stillMember) {
        setCurrentTenantId(tenants[0].tenant.id);
      }
    }
  }, [tenants, currentTenantId, enteredTenantId, isPlatformMember]);

  useEffect(() => {
    if (currentTenantId) {
      localStorage.setItem("currentTenantId", String(currentTenantId));
    }
  }, [currentTenantId]);

  let currentTenant: TenantMemberWithRoles | null = tenants.find((t) => t.tenant.id === currentTenantId) || null;

  if (!currentTenant && enteredTenantId && isPlatformMember && platformTenant) {
    currentTenant = {
      id: -1,
      tenantId: platformTenant.id,
      userId: user?.id ?? "",
      emailInvited: null,
      role: "tenant_admin",
      status: "ACTIVE",
      locationScope: "ALL",
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      phone: null,
      dateOfBirth: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      instructorType: null,
      instructorTypeByLocation: null,
      licenseNumber: null,
      licenseExpiry: null,
      permitNumber: null,
      permitExpiry: null,
      profileCompleted: true,
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: null,
      disabledAt: null,
      active: true,
      createdAt: new Date(),
      tenant: platformTenant,
      roles: ["tenant_admin"],
    } as TenantMemberWithRoles;
  }

  const isPlatformAdminInSchool = isPlatformMember && platformRole === "admin" && !!enteredTenantId;

  const hasRole = (role: string): boolean => {
    if (isPlatformAdminInSchool) return true;
    if (!currentTenant) return false;
    return currentTenant.roles?.includes(role) ?? currentTenant.role === role;
  };

  const hasAnyRole = (...roles: string[]): boolean => {
    if (isPlatformAdminInSchool) return true;
    if (!currentTenant) return false;
    const userRoles = currentTenant.roles ?? [currentTenant.role];
    return roles.some(r => userRoles.includes(r));
  };

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        tenants,
        setCurrentTenantId,
        isLoading,
        hasRole,
        hasAnyRole,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
