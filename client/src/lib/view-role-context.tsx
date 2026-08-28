import { createContext, useContext, useState, useEffect } from "react";
import { useTenant } from "@/lib/tenant-context";

type ViewRole = "admin" | "instructor" | "student";

type MemberRole = "tenant_admin" | "office_manager" | "instructor" | "student" | "parent";

interface ViewRoleContextType {
  viewRole: ViewRole;
  setViewRole: (role: ViewRole) => void;
  availableViews: { value: MemberRole; label: string; dashboardView: ViewRole }[];
  selectedMemberRole: MemberRole | null;
  setSelectedMemberRole: (role: MemberRole) => void;
}

const ViewRoleContext = createContext<ViewRoleContextType>({
  viewRole: "admin",
  setViewRole: () => {},
  availableViews: [],
  selectedMemberRole: null,
  setSelectedMemberRole: () => {},
});

const roleConfig: { role: MemberRole; label: string; dashboardView: ViewRole }[] = [
  { role: "tenant_admin", label: "Admin", dashboardView: "admin" },
  { role: "office_manager", label: "Office Manager", dashboardView: "admin" },
  { role: "instructor", label: "Instructor", dashboardView: "instructor" },
  { role: "student", label: "Student", dashboardView: "student" },
  { role: "parent", label: "Parent", dashboardView: "student" },
];

export function ViewRoleProvider({ children }: { children: React.ReactNode }) {
  const { currentTenant } = useTenant();

  const userRoles: string[] = currentTenant?.roles ?? (currentTenant ? [currentTenant.role] : []);

  const availableViews = roleConfig
    .filter((rc) => userRoles.includes(rc.role))
    .map((rc) => ({ value: rc.role, label: rc.label, dashboardView: rc.dashboardView }));

  const defaultRole = availableViews.length > 0 ? availableViews[0] : null;
  const [selectedMemberRole, setSelectedMemberRole] = useState<MemberRole | null>(defaultRole?.value ?? null);

  const viewRole: ViewRole = availableViews.find((v) => v.value === selectedMemberRole)?.dashboardView ?? "admin";

  useEffect(() => {
    const newDefault = availableViews.length > 0 ? availableViews[0].value : null;
    setSelectedMemberRole(newDefault);
  }, [currentTenant?.tenant.id]);

  const setViewRole = (role: ViewRole) => {
    const match = availableViews.find((v) => v.dashboardView === role);
    if (match) setSelectedMemberRole(match.value);
  };

  return (
    <ViewRoleContext.Provider value={{ viewRole, setViewRole, availableViews, selectedMemberRole, setSelectedMemberRole }}>
      {children}
    </ViewRoleContext.Provider>
  );
}

export function useViewRole() {
  return useContext(ViewRoleContext);
}

export type { ViewRole, MemberRole };
