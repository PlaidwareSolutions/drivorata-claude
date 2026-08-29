import { useState, useMemo, useCallback, useEffect } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users,
  UserPlus,
  Pencil,
  Ban,
  CheckCircle2,
  XCircle,
  Search,
  MapPin,
  Shield,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useLocationFilter } from "@/lib/location-filter-context";
import { useLocation, useSearch } from "wouter";

const roleLabels: Record<string, string> = {
  platform_admin: "Platform Admin",
  tenant_admin: "School Admin",
  office_manager: "Office Manager",
  instructor: "Instructor",
  student: "Student",
  parent: "Parent",
};

const allRoles = ["tenant_admin", "office_manager", "instructor", "student", "parent"];

const roleVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  platform_admin: "default",
  tenant_admin: "default",
  office_manager: "secondary",
  instructor: "secondary",
  student: "outline",
  parent: "outline",
};

const statusLabels: Record<string, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  DISABLED: "Disabled",
};

const instructorTypeLabels: Record<string, string> = {
  CLASSROOM: "Classroom",
  DRIVE: "Behind-the-Wheel",
  BOTH: "Classroom & BTW",
};

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.string().min(1, "Role is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

const addRoleSchema = z.object({
  role: z.string().min(1, "Role is required"),
});

const editSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

type MemberWithUser = {
  id: number;
  tenantId: number;
  userId: string | null;
  emailInvited: string | null;
  role: string;
  status: string;
  locationScope: number[] | "ALL" | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  instructorType: "CLASSROOM" | "DRIVE" | "BOTH" | null;
  instructorTypeByLocation: Record<string, "CLASSROOM" | "DRIVE" | "BOTH"> | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  permitNumber: string | null;
  permitExpiry: string | null;
  invitedByUserId: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  disabledAt: string | null;
  active: boolean | null;
  createdAt: string | null;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
};

type RoleInfo = {
  id: number;
  role: string;
  locationScope: number[] | "ALL" | null;
  status: string;
  instructorType: "CLASSROOM" | "DRIVE" | "BOTH" | null;
  instructorTypeByLocation: Record<string, "CLASSROOM" | "DRIVE" | "BOTH"> | null;
};

type GroupedMember = {
  key: string;
  displayName: string;
  email: string;
  phone: string | null;
  profileImageUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  roles: RoleInfo[];
  members: MemberWithUser[];
};

type LocationItem = { id: number; name: string };

const statusPriority: Record<string, number> = {
  ACTIVE: 3,
  INVITED: 2,
  DISABLED: 1,
};

function getBestStatus(members: MemberWithUser[]): string {
  let best = "DISABLED";
  let bestPri = 0;
  for (const m of members) {
    const pri = statusPriority[m.status] || 0;
    if (pri > bestPri) {
      bestPri = pri;
      best = m.status;
    }
  }
  return best;
}

function LocationCheckboxList({
  locations,
  allSelected,
  selectedIds,
  onToggleAll,
  onToggleLocation,
  isInstructor,
  instructorTypeByLoc,
  onChangeLocType,
  idPrefix,
}: {
  locations: LocationItem[];
  allSelected: boolean;
  selectedIds: number[];
  onToggleAll: (checked: boolean) => void;
  onToggleLocation: (locId: number) => void;
  isInstructor: boolean;
  instructorTypeByLoc: Record<string, string>;
  onChangeLocType: (locId: string, value: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-all`}
          checked={allSelected}
          onCheckedChange={(checked) => onToggleAll(!!checked)}
          data-testid={`checkbox-${idPrefix}-all-locations`}
        />
        <Label htmlFor={`${idPrefix}-all`} className="text-sm font-normal cursor-pointer">
          All Locations
        </Label>
      </div>
      {locations.map((loc) => {
        const locActive = allSelected || selectedIds.includes(loc.id);
        const perLocType = instructorTypeByLoc[String(loc.id)];
        return (
          <div key={loc.id} className="flex items-center gap-2 pl-4 flex-wrap">
            <Checkbox
              id={`${idPrefix}-loc-${loc.id}`}
              checked={locActive}
              onCheckedChange={() => onToggleLocation(loc.id)}
              data-testid={`checkbox-${idPrefix}-location-${loc.id}`}
            />
            <Label htmlFor={`${idPrefix}-loc-${loc.id}`} className="text-sm font-normal cursor-pointer min-w-[100px]">
              {loc.name}
            </Label>
            {isInstructor && locActive && (
              <Select
                value={perLocType || "DEFAULT"}
                onValueChange={(val) => onChangeLocType(String(loc.id), val)}
              >
                <SelectTrigger className="w-[150px]" data-testid={`select-${idPrefix}-loc-type-${loc.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEFAULT">Use Default</SelectItem>
                  <SelectItem value="CLASSROOM">Classroom</SelectItem>
                  <SelectItem value="DRIVE">Drive</SelectItem>
                  <SelectItem value="BOTH">Both</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InstructorTypeSelector({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (val: string) => void;
  testId: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Default Instructor Type</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder="Instructor Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CLASSROOM">Classroom Only</SelectItem>
          <SelectItem value="DRIVE">Drive Only</SelectItem>
          <SelectItem value="BOTH">Classroom & Drive</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Used for locations without a specific override below</p>
    </div>
  );
}

function useLocationSelection(locations: LocationItem[]) {
  const [allLocs, setAllLocs] = useState(true);
  const [selectedLocs, setSelectedLocs] = useState<number[]>([]);
  const [instructorType, setInstructorType] = useState("BOTH");
  const [typesByLoc, setTypesByLoc] = useState<Record<string, string>>({});

  const reset = useCallback(() => {
    setAllLocs(true);
    setSelectedLocs([]);
    setInstructorType("BOTH");
    setTypesByLoc({});
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    setAllLocs(checked);
    if (checked) setSelectedLocs([]);
  }, []);

  const toggleLocation = useCallback((locId: number) => {
    if (allLocs) {
      const others = locations.map(l => l.id).filter(id => id !== locId);
      setAllLocs(false);
      setSelectedLocs(others);
    } else {
      setSelectedLocs(prev => {
        if (prev.includes(locId)) {
          return prev.filter(id => id !== locId);
        } else {
          const next = [...prev, locId];
          if (next.length === locations.length) {
            setAllLocs(true);
            return [];
          }
          return next;
        }
      });
    }
  }, [allLocs, locations]);

  const changeLocType = useCallback((locId: string, val: string) => {
    setTypesByLoc(prev => {
      const next = { ...prev };
      if (val === "DEFAULT") {
        delete next[locId];
      } else {
        next[locId] = val;
      }
      return next;
    });
  }, []);

  const getLocationScope = useCallback(() => {
    return allLocs ? "ALL" as const : selectedLocs;
  }, [allLocs, selectedLocs]);

  const getFilteredOverrides = useCallback(() => {
    const activeLocs = allLocs
      ? locations.map(l => String(l.id))
      : selectedLocs.map(id => String(id));
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(typesByLoc)) {
      if (v && v !== "DEFAULT" && activeLocs.includes(k)) {
        filtered[k] = v;
      }
    }
    return Object.keys(filtered).length > 0 ? filtered : null;
  }, [allLocs, selectedLocs, typesByLoc, locations]);

  const hasValidSelection = allLocs || selectedLocs.length > 0;

  return {
    allLocs, selectedLocs, instructorType, typesByLoc,
    setAllLocs, setSelectedLocs, setInstructorType, setTypesByLoc,
    reset, toggleAll, toggleLocation, changeLocType,
    getLocationScope, getFilteredOverrides, hasValidSelection,
  };
}

function getInstructorTypeSummary(
  role: RoleInfo,
  locations: LocationItem[],
): string {
  const defaultType = role.instructorType || "BOTH";
  const byLoc = role.instructorTypeByLocation;
  if (!byLoc || Object.keys(byLoc).length === 0) {
    return instructorTypeLabels[defaultType] || defaultType;
  }
  const parts: string[] = [];
  const locMap = new Map(locations.map(l => [String(l.id), l.name]));
  for (const [locId, type] of Object.entries(byLoc)) {
    const locName = locMap.get(locId) || `#${locId}`;
    parts.push(`${locName}: ${instructorTypeLabels[type] || type}`);
  }
  return parts.join(", ");
}

export default function MembersPage() {
  const { currentTenant } = useTenant();
  const { user: authUser } = useAuth();
  const tenantId = currentTenant?.tenant.id;
  const { toast } = useToast();

  const { selectedLocationId } = useLocationFilter();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<GroupedMember | null>(null);
  const [disableGroup, setDisableGroup] = useState<GroupedMember | null>(null);
  const [cancelInviteGroup, setCancelInviteGroup] = useState<GroupedMember | null>(null);
  const [addRoleGroup, setAddRoleGroup] = useState<GroupedMember | null>(null);
  const [roleScopes, setRoleScopes] = useState<Record<number, string>>({});
  const [roleInstructorTypes, setRoleInstructorTypes] = useState<Record<number, string>>({});
  const [roleInstructorTypesByLoc, setRoleInstructorTypesByLoc] = useState<Record<number, Record<string, string>>>({});
  const [removeRoleId, setRemoveRoleId] = useState<number | null>(null);

  const { data: members = [], isLoading } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/tenants", tenantId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: locationsList = [] } = useQuery<LocationItem[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const inviteForm = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "instructor", firstName: "", lastName: "", phone: "" },
  });

  const editForm = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: { firstName: "", lastName: "", phone: "" },
  });

  const addRoleForm = useForm({
    resolver: zodResolver(addRoleSchema),
    defaultValues: { role: "instructor" },
  });

  const watchedAddRole = addRoleForm.watch("role");
  const watchedInviteRole = inviteForm.watch("role");
  const watchedInviteEmail = inviteForm.watch("email");

  const inviteLoc = useLocationSelection(locationsList);
  const addRoleLoc = useLocationSelection(locationsList);

  function getMemberKey(m: MemberWithUser): string {
    return m.userId || m.emailInvited || String(m.id);
  }

  function getMemberDisplayName(m: MemberWithUser): string {
    if (m.firstName || m.lastName) {
      return `${m.firstName || ""} ${m.lastName || ""}`.trim();
    }
    if (m.user?.firstName || m.user?.lastName) {
      return `${m.user.firstName || ""} ${m.user.lastName || ""}`.trim();
    }
    return m.emailInvited || "Unknown";
  }

  function getMemberEmail(m: MemberWithUser): string {
    return m.user?.email || m.emailInvited || "";
  }

  function getLocationScopeLabel(scope: number[] | "ALL" | null): string {
    if (!scope || scope === "ALL") return "All Locations";
    if (Array.isArray(scope)) {
      const names = scope.map((id) => locationsList.find((l) => l.id === id)?.name || `#${id}`);
      return names.join(", ");
    }
    return "All Locations";
  }

  const memberRolesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      const key = m.userId || m.emailInvited || String(m.id);
      const existing = map.get(key) || [];
      if (!existing.includes(m.role)) existing.push(m.role);
      map.set(key, existing);
    }
    return map;
  }, [members]);

  const existingMemberForInvite = useMemo(() => {
    if (!watchedInviteEmail) return null;
    const emailLower = watchedInviteEmail.toLowerCase();
    const match = members.find(
      (m) => (m.user?.email || m.emailInvited || "").toLowerCase() === emailLower
    );
    if (!match) return null;
    const key = getMemberKey(match);
    const existingRoles = memberRolesMap.get(key) || [];
    return { name: getMemberDisplayName(match), existingRoles };
  }, [watchedInviteEmail, members, memberRolesMap]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (selectedLocationId !== null) {
        const scope = m.locationScope as any;
        if (scope === "ALL" || scope === null || scope === undefined) {
        } else if (Array.isArray(scope)) {
          if (!(scope as number[]).includes(selectedLocationId)) return false;
        } else if (typeof scope === "string") {
          const ids = (scope as string).split(",").map(Number);
          if (!ids.includes(selectedLocationId)) return false;
        }
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const memberName = `${m.firstName || ""} ${m.lastName || ""}`.toLowerCase().trim();
        const userName = `${m.user?.firstName || ""} ${m.user?.lastName || ""}`.toLowerCase().trim();
        const email = (m.user?.email || m.emailInvited || "").toLowerCase();
        const phone = (m.phone || "").toLowerCase();
        if (!memberName.includes(q) && !userName.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [members, searchQuery, selectedLocationId]);

  const groupedMembers = useMemo(() => {
    const map = new Map<string, MemberWithUser[]>();
    const order: string[] = [];
    for (const m of filteredMembers) {
      const key = getMemberKey(m);
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(m);
    }

    const groups: GroupedMember[] = [];
    for (const key of order) {
      const mems = map.get(key)!;
      const first = mems[0];
      groups.push({
        key,
        displayName: getMemberDisplayName(first),
        email: getMemberEmail(first),
        phone: first.phone,
        profileImageUrl: first.user?.profileImageUrl || null,
        firstName: first.firstName || first.user?.firstName || null,
        lastName: first.lastName || first.user?.lastName || null,
        status: getBestStatus(mems),
        roles: mems.map((m) => ({
          id: m.id,
          role: m.role,
          locationScope: m.locationScope,
          status: m.status,
          instructorType: m.instructorType,
          instructorTypeByLocation: m.instructorTypeByLocation,
        })),
        members: mems,
      });
    }

    return groups.filter((g) => {
      if (roleFilter !== "all" && !g.roles.some((r) => r.role === roleFilter)) return false;
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      return true;
    });
  }, [filteredMembers, roleFilter, statusFilter]);

  const inviteMutation = useMutation({
    mutationFn: async (data: z.infer<typeof inviteSchema>) => {
      if (!inviteLoc.hasValidSelection) {
        throw new Error("Please select at least one location");
      }
      const payload: any = {
        email: data.email,
        role: data.role,
        locationScope: inviteLoc.getLocationScope(),
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        phone: data.phone || null,
      };
      if (data.role === "instructor") {
        payload.instructorType = inviteLoc.instructorType;
        const overrides = inviteLoc.getFilteredOverrides();
        if (overrides) payload.instructorTypeByLocation = overrides;
      }
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/members/invite`, payload);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      const emailLower = variables.email.toLowerCase();
      const wasExisting = members.some(
        (m) => (m.user?.email || m.emailInvited || "").toLowerCase() === emailLower
      );
      toast({ title: wasExisting ? "Role added successfully" : "Member invited successfully" });
      setInviteOpen(false);
      inviteForm.reset();
      inviteLoc.reset();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to invite member", variant: "destructive" });
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ memberId, data }: { memberId: number; data: z.infer<typeof addRoleSchema> }) => {
      if (!addRoleLoc.hasValidSelection) {
        throw new Error("Please select at least one location");
      }
      const payload: any = {
        role: data.role,
        locationScope: addRoleLoc.getLocationScope(),
      };
      if (data.role === "instructor") {
        payload.instructorType = addRoleLoc.instructorType;
        const overrides = addRoleLoc.getFilteredOverrides();
        if (overrides) payload.instructorTypeByLocation = overrides;
      }
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/members/${memberId}/add-role`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      toast({ title: "Role added successfully" });
      setAddRoleGroup(null);
      addRoleForm.reset();
      addRoleLoc.reset();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to add role", variant: "destructive" });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: {
      memberIds: number[];
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      roleScopes: Array<{ memberId: number; locationScope: string; instructorType?: string; instructorTypeByLocation?: Record<string, string> | null }>;
    }) => {
      const convertedPayload = {
        ...payload,
        roleScopes: payload.roleScopes.map((rs) => ({
          memberId: rs.memberId,
          locationScope: rs.locationScope === "ALL" ? "ALL" : rs.locationScope.split(",").map(Number),
          ...(rs.instructorType ? { instructorType: rs.instructorType } : {}),
          ...(rs.instructorTypeByLocation !== undefined ? { instructorTypeByLocation: rs.instructorTypeByLocation } : {}),
        })),
      };
      const res = await apiRequest("PATCH", `/api/tenants/${tenantId}/members/bulk-update-person`, convertedPayload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      toast({ title: "Member updated successfully" });
      setEditGroup(null);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update member", variant: "destructive" });
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const res = await apiRequest("DELETE", `/api/tenants/${tenantId}/members/${memberId}/role`);
      return res.json();
    },
    onSuccess: (_data, removedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      toast({ title: "Role removed successfully" });
      setRemoveRoleId(null);
      if (editGroup) {
        const updatedRoles = editGroup.roles.filter((r) => r.id !== removedId);
        if (updatedRoles.length === 0) {
          setEditGroup(null);
        } else {
          setEditGroup({ ...editGroup, roles: updatedRoles, members: editGroup.members.filter((m) => m.id !== removedId) });
          setRoleScopes((prev) => {
            const next = { ...prev };
            delete next[removedId];
            return next;
          });
        }
      }
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to remove role", variant: "destructive" });
      setRemoveRoleId(null);
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map((id) => apiRequest("PATCH", `/api/tenants/${tenantId}/members/${id}/disable`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      toast({ title: "Member disabled" });
      setDisableGroup(null);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to disable member", variant: "destructive" });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map((id) => apiRequest("PATCH", `/api/tenants/${tenantId}/members/${id}/enable`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      toast({ title: "Member re-enabled" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to enable member", variant: "destructive" });
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map((id) => apiRequest("DELETE", `/api/tenants/${tenantId}/members/${id}/invite`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      toast({ title: "Invite cancelled" });
      setCancelInviteGroup(null);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to cancel invite", variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map((id) => apiRequest("PATCH", `/api/tenants/${tenantId}/members/${id}/resend-invite`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "members"] });
      toast({ title: "Invite resent successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to resend invite", variant: "destructive" });
    },
  });

  function openEditDialog(group: GroupedMember) {
    editForm.reset({
      firstName: group.firstName || "",
      lastName: group.lastName || "",
      phone: group.phone || "",
    });
    const scopes: Record<number, string> = {};
    const instrTypes: Record<number, string> = {};
    const instrTypesByLoc: Record<number, Record<string, string>> = {};
    for (const r of group.roles) {
      scopes[r.id] = !r.locationScope || r.locationScope === "ALL"
        ? "ALL"
        : (r.locationScope as number[]).join(",");
      if (r.role === "instructor") {
        instrTypes[r.id] = r.instructorType || "BOTH";
        instrTypesByLoc[r.id] = r.instructorTypeByLocation ? { ...r.instructorTypeByLocation } : {};
      }
    }
    setRoleScopes(scopes);
    setRoleInstructorTypes(instrTypes);
    setRoleInstructorTypesByLoc(instrTypesByLoc);
    setEditGroup(group);
  }

  function handleEditSubmit(data: z.infer<typeof editSchema>) {
    if (!editGroup) return;
    const scopeEntries = editGroup.roles.map((r) => {
      const scope = roleScopes[r.id];
      const resolvedScope = !scope || scope === "ALL" || scope === "" ? "ALL" : scope;
      const entry: any = {
        memberId: r.id,
        locationScope: resolvedScope,
      };
      if (r.role === "instructor") {
        entry.instructorType = roleInstructorTypes[r.id] || "BOTH";
        const byLoc = roleInstructorTypesByLoc[r.id];
        if (byLoc && Object.keys(byLoc).length > 0) {
          entry.instructorTypeByLocation = byLoc;
        } else {
          entry.instructorTypeByLocation = null;
        }
      }
      return entry;
    });
    bulkUpdateMutation.mutate({
      memberIds: editGroup.roles.map((r) => r.id),
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phone: data.phone || null,
      roleScopes: scopeEntries,
    });
  }

  function openAddRoleDialog(group: GroupedMember) {
    const existingRoles = group.roles.map(r => r.role);
    const firstAvailable = allRoles.find(r => !existingRoles.includes(r)) || "instructor";
    addRoleForm.reset({ role: firstAvailable });
    addRoleLoc.reset();
    setAddRoleGroup(group);
  }

  function openInviteDialog() {
    inviteForm.reset();
    inviteLoc.reset();
    setInviteOpen(true);
  }

  const memberSearch = useSearch();
  const [, setMemberLocationPath] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(memberSearch);
    if (params.get("invite") === "1") {
      openInviteDialog();
      params.delete("invite");
      const qs = params.toString();
      setMemberLocationPath(`/admin/members${qs ? `?${qs}` : ""}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberSearch]);

  const isCurrentUserGroup = (g: GroupedMember) => g.members.some((m) => m.userId === (authUser as any)?.id);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of members) {
      counts[m.role] = (counts[m.role] || 0) + 1;
    }
    return counts;
  }, [members]);

  const memberStatusCounts = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of members) {
      const key = getMemberKey(m);
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(m.status);
    }
    const counts: Record<string, number> = {};
    Array.from(map.values()).forEach((statuses) => {
      const best = Array.from(statuses).reduce((a: string, b: string) => ((statusPriority[b] || 0) > (statusPriority[a] || 0) ? b : a));
      counts[best] = (counts[best] || 0) + 1;
    });
    return counts;
  }, [members]);

  const memberActiveFilterCount = (roleFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  function clearMemberFilters() {
    setRoleFilter("all");
    setStatusFilter("all");
  }

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-members-heading">Members</h1>
        <Button onClick={openInviteDialog} data-testid="button-invite-member">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-members"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="filter-member-role-chips">
        <Button
          variant={roleFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setRoleFilter("all")}
          data-testid="chip-role-all"
        >
          All Roles ({members.length})
        </Button>
        {allRoles.filter(r => roleCounts[r] > 0).map(r => (
          <Button
            key={r}
            variant={roleFilter === r ? "default" : "outline"}
            size="sm"
            onClick={() => setRoleFilter(r)}
            data-testid={`chip-role-${r}`}
          >
            {roleLabels[r]} ({roleCounts[r]})
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="filter-member-status-chips">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
          data-testid="chip-status-all"
        >
          All Status ({Object.values(memberStatusCounts).reduce((a, b) => a + b, 0)})
        </Button>
        {["ACTIVE", "INVITED", "DISABLED"].filter(s => memberStatusCounts[s] > 0).map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            data-testid={`chip-status-${s.toLowerCase()}`}
          >
            {statusLabels[s]} ({memberStatusCounts[s]})
          </Button>
        ))}
        {memberActiveFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearMemberFilters} data-testid="button-clear-member-filters">
            <XCircle className="h-4 w-4 mr-1" />
            Clear filters ({memberActiveFilterCount})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : groupedMembers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{members.length === 0 ? "No members yet. Invite your first team member." : "No members match your filters."}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-members">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Roles & Locations</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedMembers.map((group) => {
                    const allInvited = group.roles.every((r) => r.status === "INVITED");
                    const invitedIds = group.roles.filter((r) => r.status === "INVITED").map((r) => r.id);
                    const activeIds = group.roles.filter((r) => r.status === "ACTIVE").map((r) => r.id);
                    const disabledIds = group.roles.filter((r) => r.status === "DISABLED").map((r) => r.id);
                    const isCurrent = isCurrentUserGroup(group);

                    return (
                      <tr
                        key={group.key}
                        className="border-b last:border-b-0"
                        data-testid={`row-member-${group.key}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={group.profileImageUrl || ""} />
                              <AvatarFallback>
                                {(group.displayName[0] || "U").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" data-testid={`text-member-name-${group.key}`}>
                                {group.displayName}
                                {isCurrent && (
                                  <span className="text-xs text-muted-foreground ml-1">(you)</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground truncate" data-testid={`text-member-email-${group.key}`}>
                                {group.email}
                              </p>
                              {group.phone && (
                                <p className="text-xs text-muted-foreground truncate" data-testid={`text-member-phone-${group.key}`}>
                                  {group.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {group.roles.map((r) => (
                              <div key={r.id} className="flex items-start gap-1.5 flex-wrap" data-testid={`role-row-${group.key}-${r.role}`}>
                                <RoleBadge role={r.role} data-testid={`badge-member-role-${group.key}-${r.role}`} />
                                {r.role === "instructor" && (
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-member-instructor-type-${group.key}`}>
                                    {getInstructorTypeSummary(r, locationsList)}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {getLocationScopeLabel(r.locationScope)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={group.status === "ACTIVE" ? "secondary" : group.status === "DISABLED" ? "destructive" : "outline"}
                            data-testid={`badge-member-status-${group.key}`}
                          >
                            {statusLabels[group.status] || group.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {allInvited ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openAddRoleDialog(group)}
                                  data-testid={`button-add-role-${group.key}`}
                                  title="Add another role"
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openEditDialog(group)}
                                  data-testid={`button-edit-member-${group.key}`}
                                  title="Edit member"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => resendInviteMutation.mutate(invitedIds)}
                                  disabled={resendInviteMutation.isPending}
                                  data-testid={`button-resend-invite-${group.key}`}
                                  title="Resend Invite"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setCancelInviteGroup(group)}
                                  data-testid={`button-cancel-invite-${group.key}`}
                                  title="Cancel Invite"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openAddRoleDialog(group)}
                                  data-testid={`button-add-role-${group.key}`}
                                  title="Add another role"
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openEditDialog(group)}
                                  data-testid={`button-edit-member-${group.key}`}
                                  title="Edit member"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {activeIds.length > 0 ? (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setDisableGroup(group)}
                                    disabled={isCurrent}
                                    data-testid={`button-disable-member-${group.key}`}
                                    title={isCurrent ? "Cannot disable yourself" : "Disable member"}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                ) : disabledIds.length > 0 ? (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => enableMutation.mutate(disabledIds)}
                                    data-testid={`button-enable-member-${group.key}`}
                                    title="Re-enable member"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { if (!open) { setInviteOpen(false); inviteLoc.reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{existingMemberForInvite ? "Add Role" : "Invite Member"}</DialogTitle>
            <DialogDescription>
              {existingMemberForInvite
                ? `Add an additional role for ${existingMemberForInvite.name}. They currently have: ${existingMemberForInvite.existingRoles.map(r => roleLabels[r] || r).join(", ")}.`
                : "Send an invitation to add a new team member. They'll be linked automatically when they log in."}
            </DialogDescription>
          </DialogHeader>
          <Form {...inviteForm}>
            <form
              onSubmit={inviteForm.handleSubmit((data) => inviteMutation.mutate(data))}
              className="max-h-[70vh] overflow-y-auto space-y-4 pr-1"
            >
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="member@example.com" data-testid="input-invite-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {existingMemberForInvite && (
                <div className="rounded-md bg-muted p-3 text-sm flex items-start gap-2" data-testid="notice-existing-member">
                  <Shield className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>
                    This person is already a member. Submitting will add the <strong>{roleLabels[watchedInviteRole] || watchedInviteRole}</strong> role
                    {existingMemberForInvite.existingRoles.includes(watchedInviteRole)
                      ? " — but they already have this role."
                      : ` to their existing ${existingMemberForInvite.existingRoles.map(r => roleLabels[r] || r).join(", ")} role${existingMemberForInvite.existingRoles.length > 1 ? "s" : ""}.`}
                  </span>
                </div>
              )}
              <FormField
                control={inviteForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-invite-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="tenant_admin">School Admin</SelectItem>
                        <SelectItem value="office_manager">Office Manager</SelectItem>
                        <SelectItem value="instructor">Instructor</SelectItem>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchedInviteRole === "instructor" && (
                <InstructorTypeSelector
                  value={inviteLoc.instructorType}
                  onChange={inviteLoc.setInstructorType}
                  testId="select-invite-instructor-type"
                />
              )}

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Location Access{watchedInviteRole === "instructor" ? " & Type" : ""}
                </Label>
                <LocationCheckboxList
                  locations={locationsList}
                  allSelected={inviteLoc.allLocs}
                  selectedIds={inviteLoc.selectedLocs}
                  onToggleAll={inviteLoc.toggleAll}
                  onToggleLocation={inviteLoc.toggleLocation}
                  isInstructor={watchedInviteRole === "instructor"}
                  instructorTypeByLoc={inviteLoc.typesByLoc}
                  onChangeLocType={inviteLoc.changeLocType}
                  idPrefix="invite"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={inviteForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="First name" data-testid="input-invite-firstName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={inviteForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Last name" data-testid="input-invite-lastName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={inviteForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Phone number" data-testid="input-invite-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="text-xs text-muted-foreground">The invitee will be asked to complete their profile details (date of birth, emergency contact, license info, etc.) when they accept the invitation.</p>

              <DialogFooter>
                <Button type="submit" disabled={inviteMutation.isPending} data-testid="button-submit-invite">
                  {inviteMutation.isPending
                    ? (existingMemberForInvite ? "Adding..." : "Sending...")
                    : (existingMemberForInvite ? "Add Role" : "Send Invite")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editGroup} onOpenChange={(open) => !open && setEditGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>
              {editGroup && `Update details for ${editGroup.displayName}.`}
            </DialogDescription>
          </DialogHeader>
          {editGroup && (
            <Form {...editForm}>
              <form
                onSubmit={editForm.handleSubmit(handleEditSubmit)}
                className="max-h-[70vh] overflow-y-auto space-y-4 pr-1"
              >
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={editForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="First name" data-testid="input-edit-firstName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Last name" data-testid="input-edit-lastName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Phone number" data-testid="input-edit-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>Roles</FormLabel>
                  <div className="mt-2 space-y-4">
                    {editGroup.roles.map((r) => {
                      const currentScope = roleScopes[r.id] || "ALL";
                      const selectedLocationIds = currentScope === "ALL" ? [] : currentScope.split(",").map(Number).filter(Boolean);
                      const isAllLocations = currentScope === "ALL";

                      function toggleLocation(locId: number) {
                        setRoleScopes((prev) => {
                          const cur = prev[r.id] || "ALL";
                          if (cur === "ALL") {
                            const allExcept = locationsList
                              .map((l) => l.id)
                              .filter((id) => id !== locId);
                            return { ...prev, [r.id]: allExcept.length === 0 ? "ALL" : allExcept.join(",") };
                          }
                          const ids = cur.split(",").map(Number).filter(Boolean);
                          if (ids.includes(locId)) {
                            const remaining = ids.filter((id) => id !== locId);
                            return { ...prev, [r.id]: remaining.length === 0 ? "ALL" : remaining.join(",") };
                          } else {
                            const newIds = [...ids, locId];
                            if (newIds.length === locationsList.length) {
                              return { ...prev, [r.id]: "ALL" };
                            }
                            return { ...prev, [r.id]: newIds.join(",") };
                          }
                        });
                      }

                      function toggleAllLocations(checked: boolean) {
                        if (checked) {
                          setRoleScopes((prev) => ({ ...prev, [r.id]: "ALL" }));
                        } else {
                          setRoleScopes((prev) => ({ ...prev, [r.id]: "" }));
                        }
                      }

                      return (
                        <div key={r.id} className="border rounded-md p-3 space-y-2" data-testid={`edit-role-row-${r.id}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <RoleBadge role={r.role} data-testid={`badge-edit-role-${r.id}`} />
                            {editGroup.roles.length > 1 && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => setRemoveRoleId(r.id)}
                                data-testid={`button-remove-role-${r.id}`}
                                title="Remove role"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          {r.role === "instructor" && (
                            <InstructorTypeSelector
                              value={roleInstructorTypes[r.id] || "BOTH"}
                              onChange={(val) => setRoleInstructorTypes((prev) => ({ ...prev, [r.id]: val }))}
                              testId={`select-instructor-type-${r.id}`}
                            />
                          )}

                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Location Access{r.role === "instructor" ? " & Type" : ""}</Label>
                            <LocationCheckboxList
                              locations={locationsList}
                              allSelected={isAllLocations}
                              selectedIds={selectedLocationIds}
                              onToggleAll={toggleAllLocations}
                              onToggleLocation={toggleLocation}
                              isInstructor={r.role === "instructor"}
                              instructorTypeByLoc={roleInstructorTypesByLoc[r.id] || {}}
                              onChangeLocType={(locId, val) => {
                                setRoleInstructorTypesByLoc((prev) => {
                                  const current = { ...(prev[r.id] || {}) };
                                  if (val === "DEFAULT") {
                                    delete current[locId];
                                  } else {
                                    current[locId] = val;
                                  }
                                  return { ...prev, [r.id]: current };
                                });
                              }}
                              idPrefix={`edit-${r.id}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">Profile details (DOB, emergency contact, license info) are managed by the member via their profile page.</p>

                <DialogFooter>
                  <Button type="submit" disabled={bulkUpdateMutation.isPending} data-testid="button-save-member">
                    {bulkUpdateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Role Confirmation */}
      <AlertDialog open={removeRoleId !== null} onOpenChange={(open) => !open && setRemoveRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Role</AlertDialogTitle>
            <AlertDialogDescription>
              {removeRoleId !== null && editGroup && (() => {
                const role = editGroup.roles.find((r) => r.id === removeRoleId);
                return `Are you sure you want to remove the ${roleLabels[role?.role || ""] || role?.role || ""} role from ${editGroup.displayName}? This action cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-role">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeRoleId !== null && removeRoleMutation.mutate(removeRoleId)}
              data-testid="button-confirm-remove-role"
            >
              Remove Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Confirmation */}
      <AlertDialog open={!!disableGroup} onOpenChange={(open) => !open && setDisableGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Member</AlertDialogTitle>
            <AlertDialogDescription>
              {disableGroup && (() => {
                const name = disableGroup.displayName;
                const activeRoles = disableGroup.roles.filter((r) => r.status === "ACTIVE");
                if (activeRoles.length > 1) {
                  return `This will disable all active roles (${activeRoles.map(r => roleLabels[r.role] || r.role).join(", ")}) for ${name}. Their data will be preserved. You can re-enable them later.`;
                }
                return `This will revoke access for ${name}. Their data will be preserved for compliance and reporting. You can re-enable them later.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-disable">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!disableGroup) return;
                const activeIds = disableGroup.roles.filter((r) => r.status === "ACTIVE").map((r) => r.id);
                if (activeIds.length > 0) disableMutation.mutate(activeIds);
              }}
              data-testid="button-confirm-disable"
            >
              Disable Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Invite Confirmation */}
      <AlertDialog open={!!cancelInviteGroup} onOpenChange={(open) => !open && setCancelInviteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelInviteGroup && (() => {
                const email = cancelInviteGroup.email;
                const invitedRoles = cancelInviteGroup.roles.filter((r) => r.status === "INVITED");
                if (invitedRoles.length > 1) {
                  return `This will cancel all pending invitations (${invitedRoles.map(r => roleLabels[r.role] || r.role).join(", ")}) for ${email}. They will not be able to join using these invites.`;
                }
                return `This will cancel the pending invitation for ${email}. They will not be able to join using this invite.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-cancel-invite">Keep Invite</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!cancelInviteGroup) return;
                const invitedIds = cancelInviteGroup.roles.filter((r) => r.status === "INVITED").map((r) => r.id);
                if (invitedIds.length > 0) cancelInviteMutation.mutate(invitedIds);
              }}
              data-testid="button-confirm-cancel-invite"
            >
              Cancel Invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Role Dialog */}
      <Dialog open={!!addRoleGroup} onOpenChange={(open) => { if (!open) { setAddRoleGroup(null); addRoleLoc.reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Role</DialogTitle>
            <DialogDescription>
              {addRoleGroup && (() => {
                const name = addRoleGroup.displayName;
                const currentRoles = addRoleGroup.roles.map((r) => r.role);
                return `Add a new role for ${name}. Currently has: ${currentRoles.map(r => roleLabels[r] || r).join(", ")}.`;
              })()}
            </DialogDescription>
          </DialogHeader>
          {addRoleGroup && (
            <Form {...addRoleForm}>
              <form
                onSubmit={addRoleForm.handleSubmit((data) =>
                  addRoleMutation.mutate({ memberId: addRoleGroup.members[0].id, data })
                )}
                className="space-y-4"
              >
                <FormField
                  control={addRoleForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-add-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allRoles
                            .filter(r => !addRoleGroup?.roles.some(er => er.role === r))
                            .map(r => (
                              <SelectItem key={r} value={r}>{roleLabels[r] || r}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedAddRole === "instructor" && (
                  <InstructorTypeSelector
                    value={addRoleLoc.instructorType}
                    onChange={addRoleLoc.setInstructorType}
                    testId="select-add-role-instructor-type"
                  />
                )}

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Location Access{watchedAddRole === "instructor" ? " & Type" : ""}
                  </Label>
                  <LocationCheckboxList
                    locations={locationsList}
                    allSelected={addRoleLoc.allLocs}
                    selectedIds={addRoleLoc.selectedLocs}
                    onToggleAll={addRoleLoc.toggleAll}
                    onToggleLocation={addRoleLoc.toggleLocation}
                    isInstructor={watchedAddRole === "instructor"}
                    instructorTypeByLoc={addRoleLoc.typesByLoc}
                    onChangeLocType={addRoleLoc.changeLocType}
                    idPrefix="add-role"
                  />
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={addRoleMutation.isPending} data-testid="button-submit-add-role">
                    {addRoleMutation.isPending ? "Adding..." : "Add Role"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
