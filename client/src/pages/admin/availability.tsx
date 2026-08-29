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
import { Clock, Plus, Pencil, Trash2, MapPin, User, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import type { InstructorAvailability, Location } from "@shared/schema";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string): string {
  const [hourStr, minute] = time.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${minute} ${ampm}`;
}

const availabilitySchema = z.object({
  instructorId: z.string().min(1, "Instructor is required"),
  locationId: z.string().optional().or(z.literal("")),
  dayOfWeek: z.string().min(1, "Day is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  type: z.enum(["CLASSROOM", "DRIVE", "BOTH"]),
});

type AvailabilityFormValues = z.infer<typeof availabilitySchema>;

const defaultFormValues: AvailabilityFormValues = {
  instructorId: "",
  locationId: "",
  dayOfWeek: "",
  startTime: "",
  endTime: "",
  type: "BOTH",
};

interface Instructor {
  id: string;
  name: string;
  email: string;
}

function AvailabilityFormFields({
  form,
  instructors,
  locations,
}: {
  form: ReturnType<typeof useForm<AvailabilityFormValues>>;
  instructors: Instructor[];
  locations: Location[];
}) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="instructorId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Instructor</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ""}>
              <FormControl>
                <SelectTrigger data-testid="select-availability-instructor">
                  <SelectValue placeholder="Select instructor" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {instructors.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
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
        name="locationId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ""}>
              <FormControl>
                <SelectTrigger data-testid="select-availability-location">
                  <SelectValue placeholder="No location (optional)" />
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
        name="dayOfWeek"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Day of Week</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ""}>
              <FormControl>
                <SelectTrigger data-testid="select-availability-day">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {DAY_NAMES.map((day, index) => (
                  <SelectItem key={index} value={String(index)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="startTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start Time</FormLabel>
              <FormControl>
                <Input {...field} type="time" data-testid="input-availability-start" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="endTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>End Time</FormLabel>
              <FormControl>
                <Input {...field} type="time" data-testid="input-availability-end" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Type</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid="select-availability-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="CLASSROOM">Classroom</SelectItem>
                <SelectItem value="DRIVE">Drive</SelectItem>
                <SelectItem value="BOTH">Both</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export default function AvailabilityPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<InstructorAvailability | null>(null);
  const [filterInstructorId, setFilterInstructorId] = useState<string>("all");
  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: blocks = [], isLoading } = useQuery<InstructorAvailability[]>({
    queryKey: ["/api/tenants", tenantId, "availability"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/availability`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: instructors = [] } = useQuery<Instructor[]>({
    queryKey: ["/api/tenants", tenantId, "instructors"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/instructors`, { credentials: "include" });
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

  const createForm = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: defaultFormValues,
  });

  const editForm = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    if (editingBlock) {
      editForm.reset({
        instructorId: editingBlock.instructorId,
        locationId: editingBlock.locationId ? String(editingBlock.locationId) : "",
        dayOfWeek: String(editingBlock.dayOfWeek),
        startTime: editingBlock.startTime,
        endTime: editingBlock.endTime,
        type: editingBlock.type,
      });
    }
  }, [editingBlock, editForm]);

  const createMutation = useMutation({
    mutationFn: async (data: AvailabilityFormValues) => {
      const payload = {
        tenantId,
        instructorId: data.instructorId,
        locationId: data.locationId && data.locationId !== "none" ? parseInt(data.locationId, 10) : null,
        dayOfWeek: parseInt(data.dayOfWeek, 10),
        startTime: data.startTime,
        endTime: data.endTime,
        type: data.type,
      };
      return apiRequest("POST", `/api/tenants/${tenantId}/availability`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "availability"] });
      createForm.reset(defaultFormValues);
      setCreateDialogOpen(false);
      toast({ title: "Time block added" });
    },
    onError: () => {
      toast({ title: "Failed to add time block", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: AvailabilityFormValues) => {
      if (!editingBlock) return;
      const payload = {
        instructorId: data.instructorId,
        locationId: data.locationId && data.locationId !== "none" ? parseInt(data.locationId, 10) : null,
        dayOfWeek: parseInt(data.dayOfWeek, 10),
        startTime: data.startTime,
        endTime: data.endTime,
        type: data.type,
      };
      return apiRequest("PATCH", `/api/tenants/${tenantId}/availability/${editingBlock.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "availability"] });
      setEditingBlock(null);
      toast({ title: "Time block updated" });
    },
    onError: () => {
      toast({ title: "Failed to update time block", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/tenants/${tenantId}/availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "availability"] });
      toast({ title: "Time block deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete time block", variant: "destructive" });
    },
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  const filteredBlocks = blocks.filter((b) => {
    if (filterInstructorId !== "all" && b.instructorId !== filterInstructorId) return false;
    if (filterLocationId !== "all" && String(b.locationId || "") !== filterLocationId) return false;
    if (filterType !== "all" && b.type !== filterType) return false;
    return true;
  });

  const availActiveFilterCount = (filterInstructorId !== "all" ? 1 : 0) + (filterLocationId !== "all" ? 1 : 0) + (filterType !== "all" ? 1 : 0);

  function clearAvailFilters() {
    setFilterInstructorId("all");
    setFilterLocationId("all");
    setFilterType("all");
  }

  const availTypeCounts = blocks.reduce((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getInstructorName = (instructorId: string) => {
    const inst = instructors.find((i) => i.id === instructorId);
    return inst?.name || instructorId;
  };

  const getLocationName = (locationId: number | null) => {
    if (!locationId) return null;
    const loc = locations.find((l) => l.id === locationId);
    return loc?.name || null;
  };

  const getTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" => {
    if (type === "CLASSROOM") return "default";
    if (type === "DRIVE") return "secondary";
    return "outline";
  };

  const grouped = filteredBlocks.reduce<Record<string, InstructorAvailability[]>>((acc, block) => {
    const key = block.instructorId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(block);
    return acc;
  }, {});

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-2xl font-bold">Instructor Availability</h1>
        <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) createForm.reset(defaultFormValues); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-availability">
              <Plus className="h-4 w-4 mr-1" /> Add Time Block
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Time Block</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <AvailabilityFormFields form={createForm} instructors={instructors} locations={locations} />
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-availability">
                  {createMutation.isPending ? "Adding..." : "Add Time Block"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="filter-avail-type-chips">
        <Button
          variant={filterType === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterType("all")}
          data-testid="chip-avail-type-all"
        >
          All Types ({blocks.length})
        </Button>
        {[
          { key: "CLASSROOM", label: "Classroom" },
          { key: "DRIVE", label: "Drive" },
          { key: "BOTH", label: "Both" },
        ].filter(t => (availTypeCounts[t.key] || 0) > 0).map(t => (
          <Button
            key={t.key}
            variant={filterType === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(t.key)}
            data-testid={`chip-avail-type-${t.key.toLowerCase()}`}
          >
            {t.label} ({availTypeCounts[t.key] || 0})
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Select value={filterInstructorId} onValueChange={setFilterInstructorId}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-instructor">
            <SelectValue placeholder="All Instructors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Instructors</SelectItem>
            {instructors.map((inst) => (
              <SelectItem key={inst.id} value={inst.id}>
                {inst.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterLocationId} onValueChange={setFilterLocationId}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-location">
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
        {availActiveFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAvailFilters} data-testid="button-clear-avail-filters">
            <XCircle className="h-4 w-4 mr-1" />
            Clear filters ({availActiveFilterCount})
          </Button>
        )}
      </div>

      <Dialog open={!!editingBlock} onOpenChange={(open) => { if (!open) setEditingBlock(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Time Block</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => editMutation.mutate(data))}
              className="space-y-4"
            >
              <AvailabilityFormFields form={editForm} instructors={instructors} locations={locations} />
              <Button type="submit" disabled={editMutation.isPending} data-testid="button-save-availability">
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
      ) : filteredBlocks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No availability blocks yet. Add your first time block.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([instructorId, instrBlocks]) => (
            <div key={instructorId}>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                {getInstructorName(instructorId)}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {instrBlocks.map((block) => {
                  const locationName = getLocationName(block.locationId);
                  return (
                    <Card key={block.id} data-testid={`card-availability-${block.id}`}>
                      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                        <CardTitle className="text-base">
                          {DAY_NAMES[block.dayOfWeek]}
                        </CardTitle>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant={getTypeBadgeVariant(block.type)}>
                            {block.type}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingBlock(block)}
                            data-testid={`button-edit-availability-${block.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-delete-availability-${block.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Time Block</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this time block? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(block.id)}
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
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{formatTime(block.startTime)} - {formatTime(block.endTime)}</span>
                        </p>
                        {locationName && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" /> {locationName}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" /> {getInstructorName(block.instructorId)}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
