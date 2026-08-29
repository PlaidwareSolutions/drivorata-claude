import { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import type { Location } from "@shared/schema";

interface LocationFilterContextType {
  locations: Location[];
  selectedLocationId: number | null;
  setSelectedLocationId: (id: number | null) => void;
  isLoading: boolean;
}

const LocationFilterContext = createContext<LocationFilterContextType>({
  locations: [],
  selectedLocationId: null,
  setSelectedLocationId: () => {},
  isLoading: false,
});

export function LocationFilterProvider({ children }: { children: React.ReactNode }) {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    setSelectedLocationId(null);
  }, [tenantId]);

  // Clear a stale selection if the chosen location is no longer active (or
  // has been deleted). Prevents an invisible filter from silently narrowing
  // results when the header dropdown hides inactive locations.
  useEffect(() => {
    if (selectedLocationId == null) return;
    if (isLoading) return;
    const loc = locations.find((l) => l.id === selectedLocationId);
    if (!loc || loc.active === false) {
      setSelectedLocationId(null);
    }
  }, [locations, selectedLocationId, isLoading]);

  return (
    <LocationFilterContext.Provider value={{ locations, selectedLocationId, setSelectedLocationId, isLoading }}>
      {children}
    </LocationFilterContext.Provider>
  );
}

export function useLocationFilter() {
  return useContext(LocationFilterContext);
}
