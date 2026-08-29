import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Phone, Mail, Pencil, Trash2, ChevronDown, Globe, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import type { Location } from "@shared/schema";

const locationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "City is required"),
  state: z.string().default("TX"),
  zip: z.string().min(5, "ZIP is required"),
  countryCode: z.string().default("US"),
  timezone: z.string().default("America/Chicago"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  latitude: z.string().optional().or(z.literal("")),
  longitude: z.string().optional().or(z.literal("")),
  serviceAreaType: z.enum(["RADIUS", "ZIP_LIST", "POLYGON"]).optional().or(z.literal("")),
  serviceAreaValue: z.string().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

type LocationFormValues = z.infer<typeof locationSchema>;

const defaultFormValues: LocationFormValues = {
  name: "",
  address: "",
  addressLine2: "",
  city: "",
  state: "TX",
  zip: "",
  countryCode: "US",
  timezone: "America/Chicago",
  phone: "",
  email: "",
  latitude: "",
  longitude: "",
  serviceAreaType: "",
  serviceAreaValue: "",
  active: true,
};

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

function LocationFormFields({ form }: { form: ReturnType<typeof useForm<LocationFormValues>> }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location Name</FormLabel>
            <FormControl>
              <Input {...field} data-testid="input-location-name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Address</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Street address" data-testid="input-location-address" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="addressLine2"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Address Line 2</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Suite, unit, building (optional)" data-testid="input-location-address2" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-location-city" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-location-state" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="zip"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ZIP</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-location-zip" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="countryCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "US"}>
                <FormControl>
                  <SelectTrigger data-testid="select-location-country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="MX">Mexico</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Timezone</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "America/Chicago"}>
                <FormControl>
                  <SelectTrigger data-testid="select-location-timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {US_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Phone</FormLabel>
            <FormControl>
              <Input {...field} data-testid="input-location-phone" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input {...field} type="email" data-testid="input-location-email" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button" className="w-full justify-between" data-testid="button-toggle-advanced">
            <span className="text-sm text-muted-foreground">Advanced Options</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="latitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Latitude</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. 32.7767" data-testid="input-location-latitude" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="longitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Longitude</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. -96.7970" data-testid="input-location-longitude" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="serviceAreaType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Service Area Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-service-area-type">
                      <SelectValue placeholder="None (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="RADIUS">Pickup Radius (miles)</SelectItem>
                    <SelectItem value="ZIP_LIST">Service ZIP Codes</SelectItem>
                    <SelectItem value="POLYGON">Custom Area</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {form.watch("serviceAreaType") && form.watch("serviceAreaType") !== "" && (
            <FormField
              control={form.control}
              name="serviceAreaValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {form.watch("serviceAreaType") === "RADIUS"
                      ? "Radius (miles)"
                      : form.watch("serviceAreaType") === "ZIP_LIST"
                        ? "ZIP Codes"
                        : "Area Data"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={
                        form.watch("serviceAreaType") === "RADIUS"
                          ? "e.g. 25"
                          : form.watch("serviceAreaType") === "ZIP_LIST"
                            ? "e.g. 75001, 75002, 75003"
                            : "GeoJSON or coordinates"
                      }
                      data-testid="input-service-area-value"
                    />
                  </FormControl>
                  <FormDescription>
                    {form.watch("serviceAreaType") === "RADIUS"
                      ? "Enter the pickup radius in miles from this location."
                      : form.watch("serviceAreaType") === "ZIP_LIST"
                        ? "Enter ZIP codes separated by commas."
                        : "Enter polygon coordinates or GeoJSON data."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function LocationsPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const search = useSearch();
  const [, setLocationPath] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("create") === "1") {
      setCreateDialogOpen(true);
      params.delete("create");
      const qs = params.toString();
      setLocationPath(`/admin/locations${qs ? `?${qs}` : ""}`, { replace: true });
    }
  }, [search, setLocationPath]);

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createForm = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: defaultFormValues,
  });

  const editForm = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    if (editingLocation) {
      editForm.reset({
        name: editingLocation.name,
        address: editingLocation.address,
        addressLine2: editingLocation.addressLine2 ?? "",
        city: editingLocation.city,
        state: editingLocation.state,
        zip: editingLocation.zip,
        countryCode: editingLocation.countryCode ?? "US",
        timezone: editingLocation.timezone ?? "America/Chicago",
        phone: editingLocation.phone ?? "",
        email: editingLocation.email ?? "",
        latitude: editingLocation.latitude ?? "",
        longitude: editingLocation.longitude ?? "",
        serviceAreaType: (editingLocation.serviceAreaType as LocationFormValues["serviceAreaType"]) ?? "",
        serviceAreaValue: editingLocation.serviceAreaValue ?? "",
        active: editingLocation.active ?? true,
      });
    }
  }, [editingLocation, editForm]);

  const createMutation = useMutation({
    mutationFn: async (data: LocationFormValues) => {
      const payload = {
        ...data,
        addressLine2: data.addressLine2 || null,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        serviceAreaType: data.serviceAreaType || null,
        serviceAreaValue: data.serviceAreaValue || null,
      };
      return apiRequest("POST", `/api/tenants/${tenantId}/locations`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "locations"] });
      createForm.reset(defaultFormValues);
      setCreateDialogOpen(false);
      toast({ title: "Location added" });
    },
    onError: () => {
      toast({ title: "Failed to add location", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: LocationFormValues) => {
      if (!editingLocation) return;
      const payload = {
        ...data,
        addressLine2: data.addressLine2 || null,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        serviceAreaType: data.serviceAreaType || null,
        serviceAreaValue: data.serviceAreaValue || null,
      };
      return apiRequest("PATCH", `/api/tenants/${tenantId}/locations/${editingLocation.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "locations"] });
      setEditingLocation(null);
      toast({ title: "Location updated" });
    },
    onError: () => {
      toast({ title: "Failed to update location", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/tenants/${tenantId}/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "locations"] });
      toast({ title: "Location deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete location", variant: "destructive" });
    },
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  const getTimezoneLabel = (tz: string | null | undefined) => {
    const found = US_TIMEZONES.find((t) => t.value === tz);
    return found?.label || tz || "";
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-2xl font-bold">Locations</h1>
        <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) createForm.reset(defaultFormValues); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-location">
              <Plus className="h-4 w-4 mr-1" /> Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Location</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <LocationFormFields form={createForm} />
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-location">
                  {createMutation.isPending ? "Adding..." : "Add Location"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingLocation} onOpenChange={(open) => { if (!open) setEditingLocation(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => editMutation.mutate(data))}
              className="space-y-4"
            >
              <LocationFormFields form={editForm} />
              <Button type="submit" disabled={editMutation.isPending} data-testid="button-save-location">
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
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No locations yet. Add your first location.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <Card key={loc.id} data-testid={`card-location-${loc.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base">{loc.name}</CardTitle>
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant={loc.active ? "default" : "secondary"}>
                    {loc.active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditingLocation(loc)}
                    data-testid={`button-edit-location-${loc.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-delete-location-${loc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Location</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{loc.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(loc.id)}
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
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>
                    {loc.address}
                    {loc.addressLine2 ? `, ${loc.addressLine2}` : ""}
                    , {loc.city}, {loc.state} {loc.zip}
                  </span>
                </p>
                {loc.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" /> {loc.phone}
                  </p>
                )}
                {loc.email && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" /> {loc.email}
                  </p>
                )}
                {loc.timezone && loc.timezone !== "America/Chicago" && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0" /> {getTimezoneLabel(loc.timezone)}
                  </p>
                )}
                {loc.countryCode && loc.countryCode !== "US" && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3 shrink-0" /> {loc.countryCode}
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
