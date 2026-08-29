import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Car, Plus, Pencil, Trash2, MapPin, Wrench, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import type { Vehicle, Location } from "@shared/schema";
import { useLocationFilter } from "@/lib/location-filter-context";
import { LocationFilterIndicator } from "@/components/admin/location-filter-indicator";

const vehicleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  make: z.string().optional().or(z.literal("")),
  model: z.string().optional().or(z.literal("")),
  year: z.union([z.coerce.number().int().min(1900).max(2100), z.literal(""), z.nan()]).optional(),
  plate: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  locationId: z.union([z.coerce.number().int(), z.literal(""), z.nan()]).optional(),
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).default("ACTIVE"),
  notes: z.string().optional().or(z.literal("")),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

const defaultFormValues: VehicleFormValues = {
  name: "",
  make: "",
  model: "",
  year: "",
  plate: "",
  color: "",
  locationId: "",
  status: "ACTIVE",
  notes: "",
};

function VehicleFormFields({ form, locations }: { form: ReturnType<typeof useForm<VehicleFormValues>>; locations: Location[] }) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Vehicle Name</FormLabel>
            <FormControl>
              <Input {...field} data-testid="input-vehicle-name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="make"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Make</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Toyota" data-testid="input-vehicle-make" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="model"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Camry" data-testid="input-vehicle-model" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="year"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Year</FormLabel>
              <FormControl>
                <Input {...field} type="number" placeholder="e.g. 2024" data-testid="input-vehicle-year" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="plate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plate</FormLabel>
              <FormControl>
                <Input {...field} placeholder="License plate" data-testid="input-vehicle-plate" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="color"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Color</FormLabel>
            <FormControl>
              <Input {...field} placeholder="e.g. White" data-testid="input-vehicle-color" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="locationId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location</FormLabel>
            <Select
              onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
              value={field.value ? String(field.value) : "none"}
            >
              <FormControl>
                <SelectTrigger data-testid="select-vehicle-location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={String(loc.id)}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Status</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || "ACTIVE"}>
              <FormControl>
                <SelectTrigger data-testid="select-vehicle-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Optional notes" data-testid="input-vehicle-notes" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export default function VehiclesPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const { selectedLocationId } = useLocationFilter();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const search = useSearch();
  const [, setLocationPath] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("create") === "1") {
      setCreateDialogOpen(true);
      params.delete("create");
      const qs = params.toString();
      setLocationPath(`/admin/vehicles${qs ? `?${qs}` : ""}`, { replace: true });
    }
  }, [search, setLocationPath]);

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/tenants", tenantId, "vehicles"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/vehicles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createForm = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: defaultFormValues,
  });

  const editForm = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    if (editingVehicle) {
      editForm.reset({
        name: editingVehicle.name,
        make: editingVehicle.make ?? "",
        model: editingVehicle.model ?? "",
        year: editingVehicle.year ?? "",
        plate: editingVehicle.plate ?? "",
        color: editingVehicle.color ?? "",
        locationId: editingVehicle.locationId ?? "",
        status: editingVehicle.status ?? "ACTIVE",
        notes: editingVehicle.notes ?? "",
      });
    }
  }, [editingVehicle, editForm]);

  const createMutation = useMutation({
    mutationFn: async (data: VehicleFormValues) => {
      const payload = {
        ...data,
        make: data.make || null,
        model: data.model || null,
        year: data.year && typeof data.year === "number" && !isNaN(data.year) ? data.year : null,
        plate: data.plate || null,
        color: data.color || null,
        locationId: data.locationId && typeof data.locationId === "number" && !isNaN(data.locationId) ? data.locationId : null,
        notes: data.notes || null,
      };
      return apiRequest("POST", `/api/tenants/${tenantId}/vehicles`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "vehicles"] });
      createForm.reset(defaultFormValues);
      setCreateDialogOpen(false);
      toast({ title: "Vehicle added" });
    },
    onError: () => {
      toast({ title: "Failed to add vehicle", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: VehicleFormValues) => {
      if (!editingVehicle) return;
      const payload = {
        ...data,
        make: data.make || null,
        model: data.model || null,
        year: data.year && typeof data.year === "number" && !isNaN(data.year) ? data.year : null,
        plate: data.plate || null,
        color: data.color || null,
        locationId: data.locationId && typeof data.locationId === "number" && !isNaN(data.locationId) ? data.locationId : null,
        notes: data.notes || null,
      };
      return apiRequest("PATCH", `/api/tenants/${tenantId}/vehicles/${editingVehicle.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "vehicles"] });
      setEditingVehicle(null);
      toast({ title: "Vehicle updated" });
    },
    onError: () => {
      toast({ title: "Failed to update vehicle", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/tenants/${tenantId}/vehicles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "vehicles"] });
      toast({ title: "Vehicle deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete vehicle", variant: "destructive" });
    },
  });

  const statusCounts = vehicles.reduce((acc, v) => {
    acc[v.status || "ACTIVE"] = (acc[v.status || "ACTIVE"] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredVehicles = vehicles.filter(v => {
    if (selectedLocationId !== null && v.locationId !== selectedLocationId) return false;
    if (filterStatus !== "all" && (v.status || "ACTIVE") !== filterStatus) return false;
    if (filterLocationId !== "all" && String(v.locationId || "") !== filterLocationId) return false;
    return true;
  });

  const vehActiveFilterCount = (filterStatus !== "all" ? 1 : 0) + (filterLocationId !== "all" ? 1 : 0);

  function clearVehFilters() {
    setFilterStatus("all");
    setFilterLocationId("all");
  }

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  const getLocationName = (locationId: number | null | undefined) => {
    if (!locationId) return null;
    const loc = locations.find((l) => l.id === locationId);
    return loc?.name || null;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default">Active</Badge>;
      case "MAINTENANCE":
        return (
          <Badge variant="secondary">
            <Wrench className="h-3 w-3 mr-1" /> Maintenance
          </Badge>
        );
      case "INACTIVE":
        return <Badge variant="outline">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSubtitle = (v: Vehicle) => {
    const parts = [v.make, v.model, v.year].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Vehicles</h1>
          <LocationFilterIndicator appliesHere />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) createForm.reset(defaultFormValues); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-vehicle">
              <Plus className="h-4 w-4 mr-1" /> Add Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Vehicle</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <VehicleFormFields form={createForm} locations={locations} />
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-vehicle">
                  {createMutation.isPending ? "Adding..." : "Add Vehicle"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="filter-veh-status-chips">
        <Button
          variant={filterStatus === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("all")}
          data-testid="chip-veh-all"
        >
          All ({vehicles.length})
        </Button>
        {[
          { key: "ACTIVE", label: "Active" },
          { key: "MAINTENANCE", label: "Maintenance" },
          { key: "INACTIVE", label: "Inactive" },
        ].filter(s => (statusCounts[s.key] || 0) > 0).map(s => (
          <Button
            key={s.key}
            variant={filterStatus === s.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(s.key)}
            data-testid={`chip-veh-${s.key.toLowerCase()}`}
          >
            {s.label} ({statusCounts[s.key] || 0})
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={filterLocationId} onValueChange={setFilterLocationId}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-veh-location">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={String(loc.id)}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {vehActiveFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearVehFilters} data-testid="button-clear-veh-filters">
            <XCircle className="h-4 w-4 mr-1" />
            Clear filters ({vehActiveFilterCount})
          </Button>
        )}
      </div>

      <Dialog open={!!editingVehicle} onOpenChange={(open) => { if (!open) setEditingVehicle(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => editMutation.mutate(data))}
              className="space-y-4"
            >
              <VehicleFormFields form={editForm} locations={locations} />
              <Button type="submit" disabled={editMutation.isPending} data-testid="button-save-vehicle">
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filteredVehicles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Car className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No vehicles yet. Add your first vehicle.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredVehicles.map((v) => (
            <Card key={v.id} data-testid={`card-vehicle-${v.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base">{v.name}</CardTitle>
                <div className="flex items-center gap-1 flex-wrap">
                  {getStatusBadge(v.status)}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditingVehicle(v)}
                    data-testid={`button-edit-vehicle-${v.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-delete-vehicle-${v.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Vehicle</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{v.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(v.id)}
                          data-testid="button-confirm-delete"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {getSubtitle(v) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Car className="h-3 w-3 shrink-0" /> {getSubtitle(v)}
                  </p>
                )}
                {v.plate && (
                  <p className="text-sm text-muted-foreground" data-testid={`text-plate-${v.id}`}>
                    Plate: {v.plate}
                  </p>
                )}
                {v.color && (
                  <p className="text-sm text-muted-foreground" data-testid={`text-color-${v.id}`}>
                    Color: {v.color}
                  </p>
                )}
                {getLocationName(v.locationId) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" /> {getLocationName(v.locationId)}
                  </p>
                )}
                {v.notes && (
                  <p className="text-sm text-muted-foreground" data-testid={`text-notes-${v.id}`}>
                    {v.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}