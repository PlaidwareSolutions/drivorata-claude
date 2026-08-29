import { MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocationFilter } from "@/lib/location-filter-context";

interface LocationFilterIndicatorProps {
  appliesHere: boolean;
}

export function LocationFilterIndicator({ appliesHere }: LocationFilterIndicatorProps) {
  const { locations, selectedLocationId, setSelectedLocationId } = useLocationFilter();
  if (!appliesHere || selectedLocationId == null) return null;
  const loc = locations.find((l) => l.id === selectedLocationId);
  if (!loc) return null;
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 pl-2 pr-1 py-1 text-xs font-normal"
      data-testid="indicator-location-filter"
    >
      <MapPin className="h-3 w-3" />
      <span>
        Filtering by <span className="font-medium" data-testid="text-indicator-location-name">{loc.name}</span>
      </span>
      <button
        type="button"
        onClick={() => setSelectedLocationId(null)}
        className="ml-0.5 rounded-sm p-0.5 hover-elevate active-elevate-2"
        aria-label="Clear location filter"
        data-testid="button-clear-location-filter"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
