import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocationFilter } from "@/lib/location-filter-context";
import { Separator } from "@/components/ui/separator";
import { useLocation } from "wouter";

const LOCATION_FILTER_ROUTES: Array<string | RegExp> = [
  /^\/admin\/?$/,
  /^\/admin\/calendar(\/.*)?$/,
  /^\/admin\/enrollments(\/.*)?$/,
  /^\/admin\/vehicles(\/.*)?$/,
  /^\/admin\/my-sessions(\/.*)?$/,
  /^\/admin\/packages\/\d+(\/.*)?$/,
];

export function routeConsumesLocationFilter(path: string): boolean {
  return LOCATION_FILTER_ROUTES.some((r) => (typeof r === "string" ? path === r : r.test(path)));
}

export function AdminHeaderControls() {
  const { locations, selectedLocationId, setSelectedLocationId } = useLocationFilter();
  const [path] = useLocation();

  const activeLocations = locations.filter((l) => l.active !== false);
  if (activeLocations.length < 2) return null;
  if (!routeConsumesLocationFilter(path)) return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Separator orientation="vertical" className="h-5" />
      <div className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        <Select
          value={selectedLocationId ? String(selectedLocationId) : "all"}
          onValueChange={(v) => setSelectedLocationId(v === "all" ? null : parseInt(v))}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs border-none shadow-none bg-transparent hover:bg-accent" data-testid="select-location-filter">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="select-location-all">All Locations</SelectItem>
            {activeLocations.map((loc) => (
              <SelectItem key={loc.id} value={String(loc.id)} data-testid={`select-location-${loc.id}`}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
