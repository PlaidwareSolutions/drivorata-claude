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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Monitor, Plus, ExternalLink, Pencil, Trash2, Search, X, LayoutGrid, Table as TableIcon, MapPin, Globe } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { useWatch } from "react-hook-form";
import type { OnlineCourse, Location } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";

function OnlineCourseImageUploadButton({ onUploaded }: { onUploaded: (url: string) => void }) {
  return (
    <ObjectUploader onUploaded={onUploaded} buttonClassName="shrink-0">
      <span data-testid="button-upload-online-course-image">Upload</span>
    </ObjectUploader>
  );
}

const onlineCourseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be positive"),
  providerName: z.string().optional(),
  providerUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  language: z.enum(["ENGLISH", "SPANISH"]).default("ENGLISH"),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().min(0).default(0),
  locationScopeMode: z.enum(["ALL_LOCATIONS", "SPECIFIC_LOCATIONS"]).default("ALL_LOCATIONS"),
  locationIds: z.array(z.number()).default([]),
});

type OnlineCourseFormValues = z.infer<typeof onlineCourseSchema>;

const defaultFormValues: OnlineCourseFormValues = {
  name: "",
  description: "",
  price: 0,
  providerName: "",
  providerUrl: "",
  imageUrl: "",
  language: "ENGLISH",
  active: true,
  sortOrder: 0,
  locationScopeMode: "ALL_LOCATIONS",
  locationIds: [],
};

function OnlineCourseFormFields({
  form,
  locations,
}: {
  form: ReturnType<typeof useForm<OnlineCourseFormValues>>;
  locations?: { id: number; name: string }[];
}) {
  const locationScopeMode = useWatch({ control: form.control, name: "locationScopeMode" });
  const selectedLocationIds = useWatch({ control: form.control, name: "locationIds" }) ?? [];
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Course Name</FormLabel>
            <FormControl>
              <Input {...field} placeholder="e.g. Texas Adult Driver Education" data-testid="input-online-course-name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Describe the online course..." data-testid="input-online-course-description" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="price"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Price ($)</FormLabel>
            <FormControl>
              <Input {...field} type="number" step="0.01" data-testid="input-online-course-price" />
            </FormControl>
            <FormDescription>Enter in dollars (e.g. 99.00). Stored as cents internally.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="providerName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. myimprov.com" data-testid="input-online-course-provider-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="providerUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider URL</FormLabel>
              <FormControl>
                <Input {...field} placeholder="https://myimprov.com" data-testid="input-online-course-provider-url" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="imageUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Image URL</FormLabel>
            <div className="flex items-center gap-2">
              <FormControl>
                <Input
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder="https://..."
                  data-testid="input-online-course-image-url"
                />
              </FormControl>
              <OnlineCourseImageUploadButton onUploaded={(url) => field.onChange(url)} />
            </div>
            {field.value ? (
              <img
                src={field.value}
                alt="Course preview"
                className="mt-2 h-20 w-auto rounded border object-cover"
                data-testid="img-online-course-preview"
              />
            ) : null}
            <FormDescription>Optional image for the course listing. Paste a URL or upload one.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="language"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Language of Instruction</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? "ENGLISH"}>
              <FormControl>
                <SelectTrigger data-testid="select-online-course-language">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ENGLISH">English</SelectItem>
                <SelectItem value="SPANISH">Spanish</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>Primary language this course is taught in.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="sortOrder"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sort Order</FormLabel>
            <FormControl>
              <Input {...field} type="number" data-testid="input-online-course-sort-order" />
            </FormControl>
            <FormDescription>Lower numbers appear first</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="locationScopeMode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Available At</FormLabel>
            <Select
              onValueChange={(v) => {
                field.onChange(v);
                if (v === "ALL_LOCATIONS") {
                  form.setValue("locationIds", []);
                }
              }}
              value={field.value ?? "ALL_LOCATIONS"}
            >
              <FormControl>
                <SelectTrigger data-testid="select-online-course-location-scope">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ALL_LOCATIONS">All Locations (school-wide)</SelectItem>
                <SelectItem value="SPECIFIC_LOCATIONS">Specific Locations</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Choose whether this course is offered at every location or only at the locations you select.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {locationScopeMode === "SPECIFIC_LOCATIONS" && (
        <FormField
          control={form.control}
          name="locationIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Locations Offering This Course</FormLabel>
              {!locations || locations.length === 0 ? (
                <FormDescription>
                  No locations defined yet. Add locations on the Locations page first.
                </FormDescription>
              ) : (
                <div className="space-y-2 rounded border p-3">
                  {locations.map((loc) => {
                    const checked = (field.value ?? []).includes(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className="flex items-center gap-2"
                        data-testid={`label-online-course-location-${loc.id}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(field.value ?? []);
                            if (v === true) next.add(loc.id);
                            else next.delete(loc.id);
                            field.onChange(Array.from(next));
                          }}
                          data-testid={`checkbox-online-course-location-${loc.id}`}
                        />
                        <span>{loc.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <FormDescription>
                {selectedLocationIds.length === 0
                  ? "Select at least one location, otherwise the course will not be visible on the storefront."
                  : `${selectedLocationIds.length} location${selectedLocationIds.length === 1 ? "" : "s"} selected.`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="active"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
            <FormControl>
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                data-testid="checkbox-online-course-active"
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel>Active</FormLabel>
              <FormDescription>Inactive courses are hidden from the public site</FormDescription>
            </div>
          </FormItem>
        )}
      />
    </div>
  );
}

export default function OnlineCoursesPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<OnlineCourse | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"tiles" | "table">("tiles");

  const { data: courses = [], isLoading } = useQuery<OnlineCourse[]>({
    queryKey: ["/api/tenants", tenantId, "online-courses"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/online-courses`, { credentials: "include" });
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

  const createForm = useForm<OnlineCourseFormValues>({
    resolver: zodResolver(onlineCourseSchema),
    defaultValues: defaultFormValues,
  });

  const editForm = useForm<OnlineCourseFormValues>({
    resolver: zodResolver(onlineCourseSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    if (!editingCourse || !tenantId) return;
    let cancelled = false;
    (async () => {
      let locIds: number[] = [];
      if (editingCourse.locationScopeMode === "SPECIFIC_LOCATIONS") {
        try {
          const res = await fetch(
            `/api/tenants/${tenantId}/online-courses/${editingCourse.id}/locations`,
            { credentials: "include" },
          );
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.locationIds)) locIds = json.locationIds;
          }
        } catch {
          // best-effort
        }
      }
      if (cancelled) return;
      editForm.reset({
        name: editingCourse.name,
        description: editingCourse.description ?? "",
        price: editingCourse.price / 100,
        providerName: editingCourse.providerName ?? "",
        providerUrl: editingCourse.providerUrl ?? "",
        imageUrl: editingCourse.imageUrl ?? "",
        language: (editingCourse.language ?? "ENGLISH") as OnlineCourseFormValues["language"],
        active: editingCourse.active ?? true,
        sortOrder: editingCourse.sortOrder ?? 0,
        locationScopeMode: editingCourse.locationScopeMode ?? "ALL_LOCATIONS",
        locationIds: locIds,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [editingCourse, editForm, tenantId]);

  function buildPayload(data: OnlineCourseFormValues) {
    return {
      ...data,
      price: Math.round(data.price * 100),
      providerName: data.providerName || null,
      providerUrl: data.providerUrl || null,
      imageUrl: data.imageUrl || null,
      locationIds: data.locationScopeMode === "SPECIFIC_LOCATIONS" ? (data.locationIds ?? []) : [],
    };
  }

  const createMutation = useMutation({
    mutationFn: async (data: OnlineCourseFormValues) => {
      return apiRequest("POST", `/api/tenants/${tenantId}/online-courses`, {
        ...buildPayload(data),
        tenantId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "online-courses"] });
      createForm.reset(defaultFormValues);
      setCreateDialogOpen(false);
      toast({ title: "Online course created" });
    },
    onError: () => {
      toast({ title: "Failed to create online course", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: OnlineCourseFormValues) => {
      if (!editingCourse) return;
      return apiRequest("PATCH", `/api/tenants/${tenantId}/online-courses/${editingCourse.id}`, buildPayload(data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "online-courses"] });
      setEditingCourse(null);
      toast({ title: "Online course updated" });
    },
    onError: () => {
      toast({ title: "Failed to update online course", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/tenants/${tenantId}/online-courses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "online-courses"] });
      toast({ title: "Online course deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete online course", variant: "destructive" });
    },
  });

  const { data: courseLocationsResponse = {} as Record<string, number[]> } = useQuery<Record<string, number[]>>({
    queryKey: ["/api/tenants", tenantId, "online-course-locations"],
    queryFn: async () => {
      const out: Record<string, number[]> = {};
      const specifics = courses.filter(c => c.locationScopeMode === "SPECIFIC_LOCATIONS");
      await Promise.all(specifics.map(async (c) => {
        try {
          const res = await fetch(`/api/tenants/${tenantId}/online-courses/${c.id}/locations`, { credentials: "include" });
          if (res.ok) {
            const json = await res.json();
            out[String(c.id)] = Array.isArray(json.locationIds) ? json.locationIds : [];
          }
        } catch {}
      }));
      return out;
    },
    enabled: !!tenantId && courses.some(c => c.locationScopeMode === "SPECIFIC_LOCATIONS"),
  });

  const activeCounts = courses.reduce(
    (acc, c) => {
      if (c.active) acc.active += 1; else acc.inactive += 1;
      return acc;
    },
    { active: 0, inactive: 0 },
  );

  const filteredCourses = courses.filter(c => {
    if (filterActive === "active" && !c.active) return false;
    if (filterActive === "inactive" && c.active) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${c.name ?? ""} ${c.description ?? ""} ${c.providerName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterScope !== "all") {
      if (filterScope === "all-locations") {
        if (c.locationScopeMode !== "ALL_LOCATIONS") return false;
      } else if (filterScope === "specific") {
        if (c.locationScopeMode !== "SPECIFIC_LOCATIONS") return false;
      } else {
        const locId = Number(filterScope);
        if (!Number.isFinite(locId)) return false;
        if (c.locationScopeMode === "ALL_LOCATIONS") return true;
        const ids = courseLocationsResponse[String(c.id)];
        if (!ids) return true;
        return ids.includes(locId);
      }
    }
    return true;
  });

  const activeFilterCount =
    (filterActive !== "all" ? 1 : 0) +
    (filterScope !== "all" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  function clearFilters() {
    setFilterActive("all");
    setFilterScope("all");
    setSearchQuery("");
  }

  const sortedFiltered = [...filteredCourses].sort((a, b) => a.sortOrder - b.sortOrder);

  function renderScopeBadge(course: OnlineCourse) {
    if (course.locationScopeMode === "SPECIFIC_LOCATIONS") {
      const ids = courseLocationsResponse[String(course.id)] ?? [];
      return (
        <Badge variant="outline" className="text-xs gap-1">
          <MapPin className="h-3 w-3" />
          {ids.length > 0 ? `${ids.length} location${ids.length === 1 ? "" : "s"}` : "No locations"}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs gap-1">
        <Globe className="h-3 w-3" />
        All locations
      </Badge>
    );
  }

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-online-courses-title">Online Courses</h1>
        <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) createForm.reset(defaultFormValues); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-online-course">
              <Plus className="h-4 w-4 mr-1" /> Add Online Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Online Course</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <OnlineCourseFormFields form={createForm} locations={locations} />
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-online-course">
                  {createMutation.isPending ? "Creating..." : "Create Course"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {courses.length > 0 && (
        <>
          <div className="relative mb-3 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search courses by name, description, or provider"
              className="pl-8 h-9"
              data-testid="input-online-course-search"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-online-course-search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="filter-online-course-status-chips">
            <Button
              variant={filterActive === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterActive("all")}
              data-testid="chip-online-course-all"
            >
              All ({courses.length})
            </Button>
            {activeCounts.active > 0 && (
              <Button
                variant={filterActive === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive("active")}
                data-testid="chip-online-course-active"
              >
                Active ({activeCounts.active})
              </Button>
            )}
            {activeCounts.inactive > 0 && (
              <Button
                variant={filterActive === "inactive" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive("inactive")}
                data-testid="chip-online-course-inactive"
              >
                Inactive ({activeCounts.inactive})
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Select value={filterScope} onValueChange={setFilterScope}>
              <SelectTrigger className="h-8 w-[200px]" data-testid="select-online-course-scope-filter">
                <SelectValue placeholder="Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All availability</SelectItem>
                <SelectItem value="all-locations">School-wide</SelectItem>
                <SelectItem value="specific">Location-restricted</SelectItem>
                {locations.map((loc) => (
                  <SelectItem
                    key={loc.id}
                    value={String(loc.id)}
                    data-testid={`option-online-course-scope-loc-${loc.id}`}
                  >
                    Available at: {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-online-course-filters">
                <X className="h-4 w-4 mr-1" />
                Clear filters ({activeFilterCount})
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
              <Button
                variant={viewMode === "tiles" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("tiles")}
                data-testid="button-online-course-view-tiles"
                title="Tile view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                data-testid="button-online-course-view-table"
                title="Table view"
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium" data-testid="text-no-online-courses">No online courses yet</p>
            <p className="text-sm mt-1">Add your first online course to start reselling 3rd party courses.</p>
          </CardContent>
        </Card>
      ) : sortedFiltered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No online courses match the current filters.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters} data-testid="button-clear-online-course-filters-empty">
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "table" ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFiltered.map((course) => (
                  <TableRow key={course.id} data-testid={`row-online-course-${course.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 min-w-0">
                        {course.imageUrl && (
                          <img src={course.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                        )}
                        <span className="truncate" data-testid={`text-online-course-row-name-${course.id}`}>{course.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={course.active ? "default" : "secondary"} className="text-xs">
                        {course.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">${(course.price / 100).toFixed(2)}</TableCell>
                    <TableCell>
                      {course.providerUrl ? (
                        <a href={course.providerUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-sm">
                          {course.providerName || course.providerUrl}
                        </a>
                      ) : (
                        <span className="text-sm">{course.providerName || <span className="text-muted-foreground">—</span>}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {renderScopeBadge(course)}
                        <Badge variant="outline" className="text-xs" data-testid={`badge-online-course-language-row-${course.id}`}>
                          {(course.language ?? "ENGLISH") === "SPANISH" ? "Spanish" : "English"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setEditingCourse(course)}
                          data-testid={`button-edit-online-course-row-${course.id}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-delete-online-course-row-${course.id}`} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Online Course</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{course.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(course.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedFiltered.map((course) => (
            <Card key={course.id} className="relative flex flex-col" data-testid={`card-online-course-${course.id}`}>
              {course.imageUrl && (
                <div className="h-32 overflow-hidden rounded-t-lg">
                  <img src={course.imageUrl} alt={course.name} className="w-full h-full object-cover" data-testid={`img-online-course-${course.id}`} />
                </div>
              )}
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base leading-tight min-w-0 flex-1 break-words" data-testid={`text-online-course-name-${course.id}`}>
                  {course.name}
                </CardTitle>
                <div className="flex items-center gap-0.5 -mr-2 -mt-1 shrink-0">
                  {course.providerUrl && (
                    <a href={course.providerUrl} target="_blank" rel="noopener noreferrer">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        data-testid={`button-open-course-${course.id}`}
                        title="Open"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingCourse(course)}
                    data-testid={`button-edit-online-course-${course.id}`}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        data-testid={`button-delete-online-course-${course.id}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Online Course</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{course.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-delete-online-course">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(course.id)}
                          data-testid="button-confirm-delete-online-course"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant={course.active ? "default" : "secondary"} className="text-xs" data-testid={`badge-online-course-status-${course.id}`}>
                    {course.active ? "Active" : "Inactive"}
                  </Badge>
                  {renderScopeBadge(course)}
                  <Badge variant="outline" className="text-xs" data-testid={`badge-online-course-language-${course.id}`}>
                    {(course.language ?? "ENGLISH") === "SPANISH" ? "Spanish" : "English"}
                  </Badge>
                </div>

                {course.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-online-course-description-${course.id}`}>{course.description}</p>
                )}

                <div className="text-2xl font-semibold tabular-nums" data-testid={`text-online-course-price-${course.id}`}>
                  ${(course.price / 100).toFixed(2)}
                </div>

                {course.providerName && (
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      {course.providerUrl ? (
                        <a href={course.providerUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" data-testid={`link-online-course-provider-${course.id}`}>
                          {course.providerName}
                        </a>
                      ) : (
                        <span data-testid={`text-online-course-provider-${course.id}`}>{course.providerName}</span>
                      )}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingCourse} onOpenChange={(open) => { if (!open) setEditingCourse(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Online Course</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => editMutation.mutate(data))}
              className="space-y-4"
            >
              <OnlineCourseFormFields form={editForm} locations={locations} />
              <Button type="submit" disabled={editMutation.isPending} data-testid="button-submit-edit-online-course">
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
