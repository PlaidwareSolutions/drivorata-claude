import { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface PlatformContextType {
  isPlatformMember: boolean;
  platformRole: string | null;
  isLoading: boolean;
  viewMode: "platform" | "school";
  setViewMode: (mode: "platform" | "school") => void;
  enteredTenantId: number | null;
  enterTenant: (tenantId: number) => void;
  exitTenant: () => void;
  clearEnteredTenant: () => void;
  pendingSchoolPicker: boolean;
  setPendingSchoolPicker: (v: boolean) => void;
}

const PlatformContext = createContext<PlatformContextType>({
  isPlatformMember: false,
  platformRole: null,
  isLoading: true,
  viewMode: "school",
  setViewMode: () => {},
  enteredTenantId: null,
  enterTenant: () => {},
  exitTenant: () => {},
  clearEnteredTenant: () => {},
  pendingSchoolPicker: false,
  setPendingSchoolPicker: () => {},
});

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useState<"platform" | "school">(() => {
    const saved = localStorage.getItem("drivorata_viewMode");
    return saved === "school" ? "school" : "platform";
  });
  const [enteredTenantId, setEnteredTenantId] = useState<number | null>(() => {
    const saved = localStorage.getItem("platformEnteredTenantId");
    return saved ? parseInt(saved, 10) : null;
  });

  const { data, isLoading } = useQuery<{ isPlatformMember: boolean; role: string | null }>({
    queryKey: ["/api/platform/membership"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    localStorage.setItem("drivorata_viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (enteredTenantId) {
      localStorage.setItem("platformEnteredTenantId", String(enteredTenantId));
    } else {
      localStorage.removeItem("platformEnteredTenantId");
    }
  }, [enteredTenantId]);

  // Clear any stale platform-enter state once we know the current user is NOT
  // a platform member. Without this, a leftover `platformEnteredTenantId` in
  // localStorage (from a prior platform-admin session or a different account
  // on the same browser) would silently override a normal tenant member's
  // school selection.
  useEffect(() => {
    if (!isLoading && data && !data.isPlatformMember && enteredTenantId !== null) {
      setEnteredTenantId(null);
    }
  }, [isLoading, data, enteredTenantId]);

  const enterTenant = (tenantId: number) => {
    setEnteredTenantId(tenantId);
    setViewMode("school");
  };

  const exitTenant = () => {
    setEnteredTenantId(null);
    setViewMode("platform");
  };

  const clearEnteredTenant = () => {
    setEnteredTenantId(null);
  };

  const [pendingSchoolPicker, setPendingSchoolPicker] = useState(false);

  return (
    <PlatformContext.Provider
      value={{
        isPlatformMember: data?.isPlatformMember ?? false,
        platformRole: data?.role ?? null,
        isLoading,
        viewMode,
        setViewMode,
        enteredTenantId,
        enterTenant,
        exitTenant,
        clearEnteredTenant,
        pendingSchoolPicker,
        setPendingSchoolPicker,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  return useContext(PlatformContext);
}
