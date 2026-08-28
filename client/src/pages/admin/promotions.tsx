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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tag, Plus, Pencil, Trash2, Gift, Zap, Star, Percent } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import type { Promotion, Location as LocationType, Package as PackageType } from "@shared/schema";

const ICON_OPTIONS = [
  { value: "tag", label: "Tag", icon: Tag },
  { value: "zap", label: "Zap", icon: Zap },
  { value: "gift", label: "Gift", icon: Gift },
  { value: "star", label: "Star", icon: Star },
  { value: "percent", label: "Percent", icon: Percent },
] as const;

const promotionSchema = z.object({
  headline: z.string().min(1, "Headline is required"),
  description: z.string().min(1, "Description is required"),
  badgeText: z.string().min(1, "Badge text is required"),
  icon: z.enum(["tag", "zap", "gift", "star", "percent"]).default("tag"),
  ctaLabel: z.string().min(1, "CTA label is required").default("Claim Offer"),
  locationId: z.coerce.number().nullable().optional(),
  packageId: z.coerce.number().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().min(0).default(0),
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

const defaultFormValues: PromotionFormValues = {
  headline: "",
  description: "",
  badgeText: "",
  icon: "tag",
  ctaLabel: "Claim Offer",
  locationId: null,
  packageId: null,
  validFrom: null,
  validUntil: null,
  active: true,
  sortOrder: 0,
};

function getIconComponent(iconName: string) {
  const found = ICON_OPTIONS.find((o) => o.value === iconName);
  return found ? found.icon : Tag;
}

function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

export default function PromotionsPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

  const tenantId = currentTenant?.tenant.id;
  const search = useSearch();
  const [, setLocationPath] = useLocation();

  const { data: promotions, isLoading } = useQuery<Promotion[]>({
    queryKey: ["/api/tenants", tenantId, "promotions"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/promotions`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: locations } = useQuery<LocationType[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: packages } = useQuery<PackageType[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const form = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: (data: PromotionFormValues) =>
      apiRequest("POST", `/api/tenants/${tenantId}/promotions`, {
        ...data,
        locationId: data.locationId || null,
        packageId: data.packageId || null,
        validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : null,
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "promotions"] });
      toast({ title: "Promotion created" });
      closeDialog();
    },
    onError: () => toast({ title: "Failed to create promotion", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: PromotionFormValues) =>
      apiRequest("PATCH", `/api/tenants/${tenantId}/promotions/${editingPromo!.id}`, {
        ...data,
        locationId: data.locationId || null,
        packageId: data.packageId || null,
        validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : null,
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "promotions"] });
      toast({ title: "Promotion updated" });
      closeDialog();
    },
    onError: () => toast({ title: "Failed to update promotion", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tenants/${tenantId}/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "promotions"] });
      toast({ title: "Promotion deleted" });
    },
    onError: () => toast({ title: "Failed to delete promotion", variant: "destructive" }),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingPromo(null);
    form.reset(defaultFormValues);
  }

  function openCreate() {
    setEditingPromo(null);
    form.reset(defaultFormValues);
    setDialogOpen(true);
  }

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("create") === "1") {
      openCreate();
      params.delete("create");
      const qs = params.toString();
      setLocationPath(`/admin/promotions${qs ? `?${qs}` : ""}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openEdit(promo: Promotion) {
    setEditingPromo(promo);
    form.reset({
      headline: promo.headline,
      description: promo.description,
      badgeText: promo.badgeText,
      icon: promo.icon as PromotionFormValues["icon"],
      ctaLabel: promo.ctaLabel,
      locationId: promo.locationId,
      packageId: promo.packageId,
      validFrom: formatDateForInput(promo.validFrom),
      validUntil: formatDateForInput(promo.validUntil),
      active: promo.active,
      sortOrder: promo.sortOrder,
    });
    setDialogOpen(true);
  }

  function onSubmit(values: PromotionFormValues) {
    if (editingPromo) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  }

  if (!currentTenant) return null;

  const activeCount = promotions?.filter((p) => p.active).length ?? 0;
  const expiredCount = promotions?.filter((p) => p.validUntil && new Date(p.validUntil) < new Date()).length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-promotions-title">
            <Tag className="h-6 w-6" />
            Promotions
          </h1>
          <p className="text-muted-foreground mt-1">Manage promotional offers for your driving school</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-create-promotion">
              <Plus className="h-4 w-4 mr-2" />
              Add Promotion
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">{editingPromo ? "Edit Promotion" : "Create Promotion"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="headline" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Headline</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Spring Special!" data-testid="input-headline" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea {...field} placeholder="Describe the promotion..." data-testid="input-description" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="badgeText" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Badge Text</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. 20% OFF" data-testid="input-badge-text" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="icon" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icon</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-icon">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ICON_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className="flex items-center gap-2">
                                <opt.icon className="h-4 w-4" />
                                {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="ctaLabel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CTA Button Label</FormLabel>
                    <FormControl><Input {...field} placeholder="Claim Offer" data-testid="input-cta-label" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="locationId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <Select value={field.value?.toString() ?? "all"} onValueChange={(v) => field.onChange(v === "all" ? null : parseInt(v))}>
                        <FormControl>
                          <SelectTrigger data-testid="select-location">
                            <SelectValue placeholder="All Locations" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">All Locations (School-wide)</SelectItem>
                          {locations?.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id.toString()}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="packageId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linked Package</FormLabel>
                      <Select value={field.value?.toString() ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v))}>
                        <FormControl>
                          <SelectTrigger data-testid="select-package">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Package</SelectItem>
                          {packages?.map((pkg) => (
                            <SelectItem key={pkg.id} value={pkg.id.toString()}>{pkg.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="validFrom" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid From</FormLabel>
                      <FormControl><Input type="date" value={field.value ?? ""} onChange={field.onChange} data-testid="input-valid-from" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="validUntil" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid Until</FormLabel>
                      <FormControl><Input type="date" value={field.value ?? ""} onChange={field.onChange} data-testid="input-valid-until" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="sortOrder" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl><Input type="number" {...field} data-testid="input-sort-order" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="active" render={({ field }) => (
                    <FormItem className="flex items-center gap-3 pt-6">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-active" />
                      </FormControl>
                      <FormLabel className="!mt-0">Active</FormLabel>
                    </FormItem>
                  )} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel">Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-promotion">
                    {editingPromo ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" data-testid="text-total-count">{promotions?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total Promotions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-count">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600" data-testid="text-expired-count">{expiredCount}</div>
            <p className="text-xs text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : promotions?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Tag className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No promotions yet</h3>
            <p className="text-muted-foreground mt-1">Create your first promotion to attract more students.</p>
            <Button onClick={openCreate} className="mt-4" data-testid="button-create-first">
              <Plus className="h-4 w-4 mr-2" /> Add Promotion
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {promotions?.map((promo) => {
            const IconComp = getIconComponent(promo.icon);
            const isExpired = promo.validUntil && new Date(promo.validUntil) < new Date();
            const locationName = promo.locationId ? locations?.find((l) => l.id === promo.locationId)?.name : null;
            const packageName = promo.packageId ? packages?.find((p) => p.id === promo.packageId)?.name : null;

            return (
              <Card key={promo.id} className={`${!promo.active ? "opacity-60" : ""}`} data-testid={`card-promotion-${promo.id}`}>
                <CardContent className="flex items-start gap-4 py-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <IconComp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate" data-testid={`text-headline-${promo.id}`}>{promo.headline}</h3>
                      <Badge variant={promo.active ? "default" : "secondary"} data-testid={`badge-status-${promo.id}`}>
                        {promo.active ? "Active" : "Inactive"}
                      </Badge>
                      {isExpired && <Badge variant="outline" className="text-orange-600 border-orange-300">Expired</Badge>}
                      <Badge variant="outline">{promo.badgeText}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{promo.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {locationName && <span>Location: {locationName}</span>}
                      {!locationName && <span>School-wide</span>}
                      {packageName && <span>Package: {packageName}</span>}
                      {promo.validFrom && <span>From: {new Date(promo.validFrom).toLocaleDateString()}</span>}
                      {promo.validUntil && <span>Until: {new Date(promo.validUntil).toLocaleDateString()}</span>}
                      <span>Order: {promo.sortOrder}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(promo)} data-testid={`button-edit-${promo.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-delete-${promo.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Promotion</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{promo.headline}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(promo.id)} data-testid="button-confirm-delete">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
