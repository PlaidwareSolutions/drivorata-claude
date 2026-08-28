import { useEffect, useRef, useState } from "react";
import { Building2, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTenant } from "@/lib/tenant-context";
import { usePlatform } from "@/lib/platform-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface TenantItem {
  id: number;
  name: string;
  slug: string;
  active: boolean;
}

export function SchoolSelector() {
  const [, setLocation] = useLocation();
  const { currentTenant, tenants, setCurrentTenantId } = useTenant();
  const {
    isPlatformMember,
    enterTenant,
    pendingSchoolPicker,
    setPendingSchoolPicker,
  } = usePlatform();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: allTenants } = useQuery<TenantItem[]>({
    queryKey: ["/api/platform/tenants"],
    enabled: isPlatformMember,
    select: (data: any[]) =>
      data.map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, active: t.active })),
  });

  const schoolList = isPlatformMember
    ? (allTenants || [])
    : tenants.map((t) => ({ id: t.tenant.id, name: t.tenant.name, slug: t.tenant.slug, active: true }));

  const filtered = schoolList.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (pendingSchoolPicker) {
      setOpen(true);
      setPendingSchoolPicker(false);
    }
  }, [pendingSchoolPicker, setPendingSchoolPicker]);

  const handleSelect = (tenantId: number) => {
    if (isPlatformMember) {
      enterTenant(tenantId);
    } else {
      setCurrentTenantId(tenantId);
    }
    setOpen(false);
    setSearch("");
    setLocation("/admin");
  };

  const selectedName = currentTenant?.tenant.name || "Select school";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md border hover:bg-accent transition-colors max-w-[220px] min-w-0"
          data-testid="select-tenant"
        >
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={cn("truncate", !currentTenant && "text-muted-foreground")}>
            {selectedName}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search schools..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
              data-testid="input-search-school-picker"
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No schools found</p>
          ) : (
            filtered.map((school) => (
              <button
                key={school.id}
                className={cn(
                  "flex items-center w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors text-left",
                  currentTenant?.tenant.id === school.id && "bg-accent font-medium"
                )}
                onClick={() => handleSelect(school.id)}
                data-testid={`school-picker-item-${school.id}`}
              >
                <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                <span className="truncate">{school.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
