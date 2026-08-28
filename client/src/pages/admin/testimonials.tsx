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
import { Card, CardContent } from "@/components/ui/card";
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
import { MessageSquareQuote, Plus, Pencil, Trash2, Star, Check, X, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Testimonial, Location as LocationType } from "@shared/schema";

const SOURCE_OPTIONS = [
  { value: "in_person", label: "In Person" },
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "yelp", label: "Yelp" },
  { value: "public_form", label: "Public Form" },
  { value: "other", label: "Other" },
] as const;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "featured", label: "Featured" },
  { value: "rejected", label: "Rejected" },
] as const;

const testimonialFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  rating: z.coerce.number().int().min(1).max(5),
  quote: z.string().min(5, "Quote must be at least 5 characters"),
  photoUrl: z.string().url().optional().or(z.literal("")),
  videoUrl: z.string().url().optional().or(z.literal("")),
  source: z.enum(["in_person", "google", "facebook", "yelp", "public_form", "other"]),
  status: z.enum(["pending", "approved", "rejected", "featured"]),
  locationId: z.coerce.number().nullable().optional(),
  sortOrder: z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof testimonialFormSchema>;

const defaultValues: FormValues = {
  name: "",
  email: "",
  rating: 5,
  quote: "",
  photoUrl: "",
  videoUrl: "",
  source: "in_person",
  status: "approved",
  locationId: null,
  sortOrder: 0,
};

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    approved: { label: "Approved", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    featured: { label: "Featured", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  };
  const v = variants[status] || variants.pending;
  return <Badge className={v.className} data-testid={`badge-status-${status}`}>{v.label}</Badge>;
}

export default function TestimonialsPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const tenantId = currentTenant?.tenant.id;

  const { data: testimonials, isLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/tenants", tenantId, "testimonials", statusFilter],
    queryFn: () => {
      const url = statusFilter === "all"
        ? `/api/tenants/${tenantId}/testimonials`
        : `/api/tenants/${tenantId}/testimonials?status=${statusFilter}`;
      return fetch(url, { credentials: "include" }).then((r) => r.json());
    },
    enabled: !!tenantId,
  });

  const { data: allTestimonials } = useQuery<Testimonial[]>({
    queryKey: ["/api/tenants", tenantId, "testimonials", "all"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/testimonials`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: locations } = useQuery<LocationType[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(testimonialFormSchema),
    defaultValues,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "testimonials"] });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiRequest("POST", `/api/tenants/${tenantId}/testimonials`, {
        ...data,
        email: data.email || null,
        photoUrl: data.photoUrl || null,
        videoUrl: data.videoUrl || null,
        locationId: data.locationId || null,
      }),
    onSuccess: () => { invalidate(); toast({ title: "Testimonial created" }); closeDialog(); },
    onError: () => toast({ title: "Failed to create testimonial", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiRequest("PATCH", `/api/tenants/${tenantId}/testimonials/${editing!.id}`, {
        ...data,
        email: data.email || null,
        photoUrl: data.photoUrl || null,
        videoUrl: data.videoUrl || null,
        locationId: data.locationId || null,
      }),
    onSuccess: () => { invalidate(); toast({ title: "Testimonial updated" }); closeDialog(); },
    onError: () => toast({ title: "Failed to update testimonial", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/tenants/${tenantId}/testimonials/${id}`, { status }),
    onSuccess: () => { invalidate(); toast({ title: "Status updated" }); },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tenants/${tenantId}/testimonials/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Testimonial deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    form.reset(defaultValues);
  }

  function openCreate() {
    setEditing(null);
    form.reset(defaultValues);
    setDialogOpen(true);
  }

  function openEdit(t: Testimonial) {
    setEditing(t);
    form.reset({
      name: t.name,
      email: t.email || "",
      rating: t.rating,
      quote: t.quote,
      photoUrl: t.photoUrl || "",
      videoUrl: t.videoUrl || "",
      source: t.source as FormValues["source"],
      status: t.status as FormValues["status"],
      locationId: t.locationId,
      sortOrder: t.sortOrder,
    });
    setDialogOpen(true);
  }

  function onSubmit(values: FormValues) {
    if (editing) updateMutation.mutate(values);
    else createMutation.mutate(values);
  }

  if (!currentTenant) return null;

  const statsSource = allTestimonials ?? testimonials ?? [];
  const total = statsSource.length;
  const pending = statsSource.filter((t) => t.status === "pending").length;
  const approved = statsSource.filter((t) => t.status === "approved" || t.status === "featured").length;
  const featured = statsSource.filter((t) => t.status === "featured").length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-testimonials-title">
            <MessageSquareQuote className="h-6 w-6" />
            Testimonials
          </h1>
          <p className="text-muted-foreground mt-1">Central library of student reviews. Submissions from your public site land here as pending.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-create-testimonial">
              <Plus className="h-4 w-4 mr-2" /> Add Testimonial
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Testimonial" : "Add Testimonial"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Student Name</FormLabel>
                    <FormControl><Input {...field} data-testid="input-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl><Input type="email" {...field} data-testid="input-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="rating" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rating</FormLabel>
                      <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rating"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[5, 4, 3, 2, 1].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n} star{n !== 1 ? "s" : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="source" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-source"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="quote" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quote</FormLabel>
                    <FormControl><Textarea rows={4} {...field} data-testid="input-quote" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="photoUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Photo URL (optional)</FormLabel>
                    <FormControl><Input {...field} placeholder="https://..." data-testid="input-photo-url" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="videoUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Video URL (optional)</FormLabel>
                    <FormControl><Input {...field} placeholder="https://youtube.com/..." data-testid="input-video-url" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="locationId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <Select value={field.value?.toString() ?? "all"} onValueChange={(v) => field.onChange(v === "all" ? null : parseInt(v))}>
                        <FormControl>
                          <SelectTrigger data-testid="select-location"><SelectValue placeholder="All Locations" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">All Locations</SelectItem>
                          {locations?.map((loc) => <SelectItem key={loc.id} value={loc.id.toString()}>{loc.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="sortOrder" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl><Input type="number" {...field} data-testid="input-sort-order" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel">Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
                    {editing ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold" data-testid="text-total-count">{total}</div><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600" data-testid="text-pending-count">{pending}</div><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600" data-testid="text-approved-count">{approved}</div><p className="text-xs text-muted-foreground">Approved</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600" data-testid="text-featured-count">{featured}</div><p className="text-xs text-muted-foreground">Featured</p></CardContent></Card>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : (testimonials?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquareQuote className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No testimonials yet</h3>
            <p className="text-muted-foreground mt-1">Add testimonials manually or accept submissions from your public site.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {testimonials?.map((t) => {
            const locationName = t.locationId ? locations?.find((l) => l.id === t.locationId)?.name : null;
            return (
              <Card key={t.id} data-testid={`card-testimonial-${t.id}`}>
                <CardContent className="flex items-start gap-4 py-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {t.photoUrl ? (
                      <img src={t.photoUrl} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <span className="font-semibold text-primary">{t.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold" data-testid={`text-name-${t.id}`}>{t.name}</h3>
                      <div className="flex items-center" data-testid={`rating-${t.id}`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`h-3 w-3 ${n <= t.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                        ))}
                      </div>
                      <StatusBadge status={t.status} />
                      <Badge variant="outline" className="capitalize">{t.source.replace("_", " ")}</Badge>
                      {locationName && <Badge variant="outline">{locationName}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 italic">"{t.quote}"</p>
                    {t.email && <p className="text-xs text-muted-foreground mt-1">{t.email}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      {t.status === "pending" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: t.id, status: "approved" })} data-testid={`button-approve-${t.id}`} title="Approve">
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: t.id, status: "rejected" })} data-testid={`button-reject-${t.id}`} title="Reject">
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                      {(t.status === "approved" || t.status === "featured") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => statusMutation.mutate({ id: t.id, status: t.status === "featured" ? "approved" : "featured" })}
                          data-testid={`button-feature-${t.id}`}
                          title={t.status === "featured" ? "Unfeature" : "Feature"}
                        >
                          <Sparkles className={`h-4 w-4 ${t.status === "featured" ? "text-blue-600 fill-blue-200" : "text-muted-foreground"}`} />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)} data-testid={`button-edit-${t.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" data-testid={`button-delete-${t.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Testimonial</AlertDialogTitle>
                            <AlertDialogDescription>Delete testimonial from "{t.name}"? This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(t.id)} data-testid={`button-confirm-delete-${t.id}`}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
