import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, DollarSign, Clock, Car, Users, Shield, Trash2, X, Boxes, BookOpen, GraduationCap, Eye, ClipboardCheck, FileText, ExternalLink, LayoutGrid, Table as TableIcon, MapPin, Globe, PlayCircle, ChevronDown, ChevronUp, Search, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useLocation, useSearch } from "wouter";
import { useState, useEffect } from "react";
import type { PackageWithDependencies as PackageType, PackageComponent } from "@shared/schema";
import { AddPackageWizard, hasAddPackageDraft } from "@/components/admin/wizards/add-package-wizard";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  getEffectivePricesByLocation as sharedGetEffectivePricesByLocation,
  hasMixedPrices as sharedHasMixedPrices,
} from "@/lib/package-pricing";

const packageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be positive"),
  // SIMPLE = single bookable item (e.g. Road Test, School Car). COHORT_BASED
  // = traditional in-class package with one or more cohorts/offerings.
  kind: z.enum(["SIMPLE", "COHORT_BASED"]).default("COHORT_BASED"),
  sellableStandalone: z.boolean().default(true),
  availableAsUpsell: z.boolean().default(false),
  audience: z.enum(["TEENS", "ADULTS", "BOTH"]).default("BOTH"),
  tier: z.enum(["PRIMARY", "AUXILIARY"]).default("PRIMARY"),
  language: z.enum(["ENGLISH", "SPANISH"]).default("ENGLISH"),
  imageUrl: z.string().optional().nullable(),
  // Parent packages whose presence in the cart unlocks this upsell. Empty
  // = no constraint (legacy generic add-on behavior).
  upsellParentPackageIds: z.array(z.number()).default([]),
  classroomHoursRequired: z.coerce.number().min(0).default(0),
  driveHoursRequired: z.coerce.number().min(0).default(0),
  requiresPermit: z.boolean().default(false),
  ageMin: z.coerce.number().min(0).nullable().optional(),
  ageMax: z.coerce.number().min(0).nullable().optional(),
  creditClassroom: z.coerce.number().min(0).default(0),
  creditDrive: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true),
  locationScopeMode: z.enum(["ALL_LOCATIONS", "SPECIFIC_LOCATIONS"]).default("ALL_LOCATIONS"),
  locationIds: z.array(z.number()).default([]),
  // Per-location price overrides for SPECIFIC_LOCATIONS packages. Keys are
  // locationId (as numbers via z.coerce in the record key); values are
  // dollars (UI representation; we convert to cents on submit). `null` =
  // "no override, use the package's default price at this location".
  locationPriceOverrides: z.record(z.union([z.number().min(0), z.null()])).default({}),
});

type PackageFormValues = z.infer<typeof packageSchema>;

function PackageImageUploadButton({ onUploaded }: { onUploaded: (url: string) => void }) {
  return (
    <ObjectUploader onUploaded={onUploaded} buttonClassName="shrink-0">
      <span data-testid="button-upload-package-image">Upload</span>
    </ObjectUploader>
  );
}

const defaultFormValues: PackageFormValues = {
  name: "",
  description: "",
  price: 0,
  kind: "COHORT_BASED",
  sellableStandalone: true,
  availableAsUpsell: false,
  audience: "BOTH",
  tier: "PRIMARY",
  language: "ENGLISH",
  imageUrl: "",
  upsellParentPackageIds: [],
  classroomHoursRequired: 0,
  driveHoursRequired: 0,
  requiresPermit: false,
  ageMin: null,
  ageMax: null,
  creditClassroom: 0,
  creditDrive: 0,
  active: true,
  locationScopeMode: "ALL_LOCATIONS",
  locationIds: [],
  locationPriceOverrides: {},
};

const COMPONENT_TYPES = [
  { value: "ONLINE_PERMIT", label: "Online Permit Course", icon: BookOpen, hoursLabel: "Hours" },
  { value: "IN_CLASS", label: "In-Class Instruction", icon: GraduationCap, hoursLabel: "Hours" },
  { value: "BTW_OBSERVATION", label: "BTW Observation", icon: Eye, hoursLabel: "Hours" },
  { value: "BTW_PRACTICE", label: "BTW Practice (Drive)", icon: Car, hoursLabel: "Hours" },
  { value: "ROAD_TEST", label: "Road Test", icon: ClipboardCheck, hoursLabel: "Sessions" },
  { value: "STUDY_GUIDE", label: "Study Guide", icon: FileText, hoursLabel: "Items" },
] as const;

type ComponentType = typeof COMPONENT_TYPES[number]["value"];

export { packageSchema, defaultFormValues, COMPONENT_TYPES };
export type { PackageFormValues, ComponentType };

export function PackageActiveField({
  form,
}: {
  form: ReturnType<typeof useForm<PackageFormValues>>;
}) {
  return (
    <FormField
      control={form.control}
      name="active"
      render={({ field }) => (
        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
          <FormControl>
            <Checkbox
              checked={!!field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              data-testid="checkbox-active"
            />
          </FormControl>
          <div className="space-y-1 leading-none">
            <span className="text-sm font-medium leading-none">Active</span>
            <FormDescription>Inactive packages are hidden from the public site</FormDescription>
          </div>
        </FormItem>
      )}
    />
  );
}

export function PackageFormFields({
  form,
  locations,
  allPackages,
  selfPackageId,
  omitActive,
  sectioned,
}: {
  form: ReturnType<typeof useForm<PackageFormValues>>;
  locations?: { id: number; name: string }[];
  /** Other packages eligible to be parents for upsell dependencies. */
  allPackages?: { id: number; name: string }[];
  /** When editing an existing package, exclude it from the parent picker. */
  selfPackageId?: number | null;
  /** When true, the Active checkbox is not rendered here so the caller can place it elsewhere (e.g. after the Components manager). */
  omitActive?: boolean;
  /** When true, group fields into labeled sub-sections with headings, helper text, and dividers. */
  sectioned?: boolean;
}) {
  const Section = ({
    title,
    description,
    first,
    testId,
    children,
  }: {
    title: string;
    description?: string;
    first?: boolean;
    testId?: string;
    children: React.ReactNode;
  }) => {
    if (!sectioned) return <>{children}</>;
    return (
      <section
        className={first ? "space-y-4" : "space-y-4 pt-6 border-t"}
        data-testid={testId}
      >
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {children}
      </section>
    );
  };
  const locationScopeMode = useWatch({ control: form.control, name: "locationScopeMode" });
  const selectedLocationIds = useWatch({ control: form.control, name: "locationIds" }) ?? [];
  const kind = useWatch({ control: form.control, name: "kind" }) ?? "COHORT_BASED";
  const sellableStandalone = useWatch({ control: form.control, name: "sellableStandalone" });
  const availableAsUpsell = useWatch({ control: form.control, name: "availableAsUpsell" });
  const selectedParentIds = useWatch({ control: form.control, name: "upsellParentPackageIds" }) ?? [];
  const isSimple = kind === "SIMPLE";
  const priceOverrides = useWatch({ control: form.control, name: "locationPriceOverrides" }) ?? {};
  const defaultPrice = useWatch({ control: form.control, name: "price" });

  return (
    <div className="space-y-4">
      <Section title="Basics" description="Type, name, status, price, listing image, and language." first testId="section-package-basics">
      <FormField
        control={form.control}
        name="kind"
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel>Package Type</FormLabel>
            <div className="flex flex-col gap-2 rounded border p-3">
              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  className="mt-1"
                  checked={field.value === "COHORT_BASED"}
                  onChange={() => field.onChange("COHORT_BASED")}
                  data-testid="radio-kind-cohort-based"
                />
                <div>
                  <div className="font-medium">Cohort</div>
                  <div className="text-xs text-muted-foreground">In-class package with one or more cohorts/sessions (e.g. Teen 32-hour course).</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  className="mt-1"
                  checked={field.value === "SIMPLE"}
                  onChange={() => field.onChange("SIMPLE")}
                  data-testid="radio-kind-simple"
                />
                <div>
                  <div className="font-medium">Non-cohort</div>
                  <div className="text-xs text-muted-foreground">Single bookable item with no cohorts (e.g. Road Test, School Car for Road Test).</div>
                </div>
              </label>
            </div>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Package Name</FormLabel>
            <FormControl>
              <Input {...field} placeholder="e.g. Teen Complete Package" data-testid="input-package-name" />
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
              <Textarea {...field} data-testid="input-package-description" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {!omitActive && <PackageActiveField form={form} />}
      <FormField
        control={form.control}
        name="price"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Price ($)</FormLabel>
            <FormControl>
              <Input {...field} type="number" step="0.01" data-testid="input-package-price" />
            </FormControl>
            <FormDescription>
              Enter in dollars (e.g. 599.00). Stored as cents internally.
              {(locations?.length ?? 0) > 1 && (
                <> To charge a different price at each location, scroll down to <strong>Location Availability</strong>, choose <strong>Specific Locations</strong>, then enter a price next to each checked location.</>
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
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
                  data-testid="input-package-image-url"
                />
              </FormControl>
              <PackageImageUploadButton
                onUploaded={(url) => field.onChange(url)}
              />
            </div>
            {field.value ? (
              <img
                src={field.value}
                alt="Package preview"
                className="mt-2 h-20 w-auto rounded border object-cover"
                data-testid="img-package-preview"
              />
            ) : null}
            <FormDescription>Optional listing image. Paste a URL or upload one.</FormDescription>
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
                <SelectTrigger data-testid="select-package-language">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ENGLISH">English</SelectItem>
                <SelectItem value="SPANISH">Spanish</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>Primary language this package is taught in.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      </Section>

      <Section title="Audience & Marketing" description="Storefront tier, audience, age gates, and prerequisite flags." testId="section-package-audience">
      <FormField
        control={form.control}
        name="tier"
        render={({ field }) => (
          <FormItem>
            <div className="text-sm font-medium leading-none">Storefront tier</div>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value ?? "PRIMARY"}
                className="flex flex-row flex-wrap gap-4"
                data-testid="radio-package-tier"
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="PRIMARY" data-testid="radio-package-tier-primary" />
                  Primary
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="AUXILIARY" data-testid="radio-package-tier-auxiliary" />
                  Auxiliary
                </label>
              </RadioGroup>
            </FormControl>
            <FormDescription>
              Primary packages appear at the top of the storefront list; Auxiliary packages are sorted to the bottom.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="audience"
        render={({ field }) => (
          <FormItem>
            <div className="text-sm font-medium leading-none">Audience</div>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value ?? "BOTH"}
                className="flex flex-row flex-wrap gap-4"
                data-testid="radio-package-audience"
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="TEENS" data-testid="radio-package-audience-teens" />
                  Teens
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="ADULTS" data-testid="radio-package-audience-adults" />
                  Adults
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="BOTH" data-testid="radio-package-audience-both" />
                  Both (All Ages)
                </label>
              </RadioGroup>
            </FormControl>
            <FormDescription>
              Marketing label for who this package is intended for. Independent of the age range above.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="ageMin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Minimum Age</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                  placeholder="e.g. 14"
                  data-testid="input-age-min"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ageMax"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maximum Age</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                  placeholder="e.g. 17"
                  data-testid="input-age-max"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="requiresPermit"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
            <FormControl>
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                data-testid="checkbox-requires-permit"
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <span className="text-sm font-medium leading-none">Requires Learner's Permit</span>
              <FormDescription>Student must have a learner's permit before enrolling</FormDescription>
            </div>
          </FormItem>
        )}
      />

      </Section>

      <Section title="Sales Channels" description="Where buyers can find this package — standalone, upsell, or both." testId="section-package-sales-channels">
      <div className="rounded border p-3 space-y-3">
        <div className="text-sm font-medium">Sales channels</div>
        <FormField
          control={form.control}
          name="sellableStandalone"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  data-testid="checkbox-sellable-standalone"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <span className="text-sm font-medium leading-none">Sellable on its own</span>
                <FormDescription>Appears in the storefront packages list and can be checked out alone.</FormDescription>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="availableAsUpsell"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    if (checked !== true) {
                      form.setValue("upsellParentPackageIds", []);
                    }
                  }}
                  data-testid="checkbox-available-as-upsell"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <span className="text-sm font-medium leading-none">Available as an upsell at checkout</span>
                <FormDescription>Appears in the cart upsell list (e.g. School Car for Road Test).</FormDescription>
              </div>
            </FormItem>
          )}
        />
        {sellableStandalone === false && availableAsUpsell !== true && (
          <p className="text-xs text-destructive" data-testid="text-sellable-warning">
            This package is neither sellable on its own nor available as an upsell — buyers will not see it anywhere.
          </p>
        )}
        {availableAsUpsell && (
          <FormField
            control={form.control}
            name="upsellParentPackageIds"
            render={() => (
              <FormItem>
                <div className="text-xs font-medium leading-none">Only show as upsell when one of these parent packages is in the cart</div>
                {!allPackages || allPackages.length === 0 ? (
                  <FormDescription>No other packages available yet. Leave empty to show as a generic upsell.</FormDescription>
                ) : (
                  <div className="space-y-1 rounded border p-2 max-h-48 overflow-y-auto">
                    {allPackages
                      .filter((p) => p.id !== selfPackageId)
                      .map((p) => {
                        const checked = selectedParentIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                            data-testid={`label-upsell-parent-${p.id}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                const next = new Set(selectedParentIds);
                                if (v === true) next.add(p.id);
                                else next.delete(p.id);
                                form.setValue("upsellParentPackageIds", Array.from(next), { shouldDirty: true });
                              }}
                              data-testid={`checkbox-upsell-parent-${p.id}`}
                            />
                            <span>{p.name}</span>
                          </label>
                        );
                      })}
                  </div>
                )}
                <FormDescription className="text-xs">
                  Empty = show whenever the cart has any item (legacy generic add-on behavior).
                </FormDescription>
              </FormItem>
            )}
          />
        )}
      </div>

      </Section>

      <Section title="Location Availability" description="Restrict this package to specific locations and (optionally) override the price per location." testId="section-package-location-availability">
      <FormField
        control={form.control}
        name="locationScopeMode"
        render={({ field }) => (
          <FormItem>
            <div className="text-sm font-medium leading-none">Available At</div>
            <FormControl>
              <RadioGroup
                onValueChange={(v) => {
                  field.onChange(v);
                  if (v === "ALL_LOCATIONS") {
                    form.setValue("locationIds", []);
                  }
                }}
                value={field.value ?? "ALL_LOCATIONS"}
                className="flex flex-row flex-wrap gap-4"
                data-testid="radio-package-location-scope"
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="ALL_LOCATIONS" data-testid="radio-package-location-scope-all" />
                  All Locations (school-wide)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="SPECIFIC_LOCATIONS" data-testid="radio-package-location-scope-specific" />
                  Specific Locations
                </label>
              </RadioGroup>
            </FormControl>
            <FormDescription>
              Choose whether this package is offered at every location or only at the locations you select.
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
              <FormLabel>Locations Offering This Package</FormLabel>
              {!locations || locations.length === 0 ? (
                <FormDescription>
                  No locations defined yet. Add locations on the Locations page first.
                </FormDescription>
              ) : (
                <div className="space-y-2 rounded border p-3">
                  {locations.map((loc) => {
                    const checked = (field.value ?? []).includes(loc.id);
                    const overrideKey = String(loc.id);
                    const overrideVal = priceOverrides?.[overrideKey];
                    return (
                      <div
                        key={loc.id}
                        className="flex items-center gap-2"
                        data-testid={`label-package-location-${loc.id}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(field.value ?? []);
                            if (v === true) next.add(loc.id);
                            else {
                              next.delete(loc.id);
                              // Drop the price override for a location that
                              // is no longer linked, so we never send stale
                              // overrides for unselected locations.
                              const nextOverrides = { ...(priceOverrides ?? {}) };
                              delete nextOverrides[overrideKey];
                              form.setValue("locationPriceOverrides", nextOverrides, { shouldDirty: true });
                            }
                            field.onChange(Array.from(next));
                          }}
                          data-testid={`checkbox-package-location-${loc.id}`}
                        />
                        <span className="flex-1">{loc.name}</span>
                        {checked && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-8 w-24"
                              value={overrideVal == null ? "" : String(overrideVal)}
                              placeholder={defaultPrice != null ? String(defaultPrice) : ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextOverrides = { ...(priceOverrides ?? {}) };
                                if (raw === "") {
                                  // Empty input = "no override, fall back to default price".
                                  delete nextOverrides[overrideKey];
                                } else {
                                  const num = Number(raw);
                                  if (Number.isFinite(num) && num >= 0) {
                                    nextOverrides[overrideKey] = num;
                                  }
                                }
                                form.setValue("locationPriceOverrides", nextOverrides, { shouldDirty: true });
                              }}
                              data-testid={`input-package-location-price-${loc.id}`}
                              aria-label={`Price override at ${loc.name}`}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {(locations?.length ?? 0) > 0 && (
                <FormDescription>
                  Leave a location's price blank to use the default price above. Filling it in
                  overrides the price only when a buyer chooses that location.
                </FormDescription>
              )}
              <FormDescription>
                {selectedLocationIds.length === 0
                  ? "Select at least one location, otherwise the package will not be visible on the storefront."
                  : `${selectedLocationIds.length} location${selectedLocationIds.length === 1 ? "" : "s"} selected.`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      </Section>

      <Section title="Hours & Credits" description="Required instructional hours and credits granted upon enrollment." testId="section-package-hours-credits">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="classroomHoursRequired"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Classroom Hours Required</FormLabel>
              <FormControl>
                <Input {...field} type="number" data-testid="input-classroom-hours-required" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="driveHoursRequired"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Drive Hours Required</FormLabel>
              <FormControl>
                <Input {...field} type="number" data-testid="input-drive-hours-required" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="creditClassroom"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Classroom Credits</FormLabel>
              <FormControl>
                <Input {...field} type="number" data-testid="input-credit-classroom" />
              </FormControl>
              <FormDescription>Credits included in package</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="creditDrive"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Drive Credits</FormLabel>
              <FormControl>
                <Input {...field} type="number" data-testid="input-credit-drive" />
              </FormControl>
              <FormDescription>Credits included in package</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      </Section>
    </div>
  );
}

export function PackageComponentsManager({ tenantId, packageId }: { tenantId: number; packageId: number }) {
  const { toast } = useToast();
  const [addType, setAddType] = useState<ComponentType>("IN_CLASS");
  const [addLabel, setAddLabel] = useState("");
  const [addHours, setAddHours] = useState<number>(0);
  const [addQty, setAddQty] = useState<number>(1);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const addTypeDef = COMPONENT_TYPES.find((t) => t.value === addType);

  const { data: components = [], isLoading } = useQuery<PackageComponent[]>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "components"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages/${packageId}/components`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/tenants/${tenantId}/packages/${packageId}/components`, {
        type: addType,
        label: addLabel || null,
        hours: addHours,
        quantity: addQty,
        sortOrder: components.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages", packageId, "components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "package-components"] });
      setAddLabel("");
      setAddHours(0);
      setAddQty(1);
      toast({ title: "Component added" });
    },
    onError: () => toast({ title: "Failed to add component", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (cid: number) =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/packages/${packageId}/components/${cid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages", packageId, "components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "package-components"] });
      toast({ title: "Component removed" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/30" data-testid="section-components">
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4" />
        <h4 className="text-sm font-medium">Components</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Build this package from typed components. Each component represents a deliverable (online permit course, in-class hours, behind-the-wheel sessions, road test, etc).
      </p>

      {isLoading ? (
        <Skeleton className="h-10" />
      ) : components.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No components yet. Add the first one below.</p>
      ) : (
        <div className="space-y-2">
          {components.map(c => {
            const def = COMPONENT_TYPES.find(t => t.value === c.type);
            const Icon = def?.icon || Boxes;
            return (
              <div key={c.id} className="flex items-center gap-2 p-2 bg-background rounded border" data-testid={`row-component-${c.id}`}>
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.label || def?.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {def?.label}
                    {(c.hours ?? 0) > 0 ? ` · ${c.hours} ${def?.hoursLabel.toLowerCase()}` : ""}
                    {(c.quantity ?? 1) > 1 ? ` · qty ${c.quantity}` : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMut.mutate(c.id)}
                  data-testid={`button-delete-component-${c.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t pt-4 space-y-4">
        <div>
          <p className="text-sm font-medium">Add component</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Components are the parts that make up this package — what students actually receive (e.g. 6 hours of in-class instruction, 7 hours of behind-the-wheel practice).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="component-type">Type</label>
            <Select value={addType} onValueChange={(v) => setAddType(v as ComponentType)}>
              <SelectTrigger id="component-type" data-testid="select-component-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPONENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Picks the kind of deliverable — drives the icon and unit shown to students.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="component-hours">{addTypeDef?.hoursLabel ?? "Amount"}</label>
            <Input
              id="component-hours"
              type="number"
              min={0}
              placeholder={`e.g. ${addType === "BTW_PRACTICE" ? "7" : addType === "IN_CLASS" ? "24" : "1"}`}
              value={addHours}
              onChange={(e) => setAddHours(Number(e.target.value) || 0)}
              data-testid="input-component-hours"
            />
            <p className="text-xs text-muted-foreground">
              {addTypeDef?.hoursLabel === "Hours"
                ? "Total hours included for this component."
                : `Number of ${addTypeDef?.hoursLabel.toLowerCase() ?? "units"} included.`}
            </p>
          </div>
        </div>

        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowMoreOptions((v) => !v)}
            data-testid="button-toggle-more-options"
          >
            {showMoreOptions ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            {showMoreOptions ? "Hide options" : "More options"}
          </Button>
          {showMoreOptions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="component-label">Custom label</label>
                <Input
                  id="component-label"
                  placeholder={addTypeDef?.label ?? "Display name"}
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  data-testid="input-component-label"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Overrides the name shown to students (defaults to the type name).
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="component-quantity">Quantity</label>
                <Input
                  id="component-quantity"
                  type="number"
                  placeholder="1"
                  value={addQty}
                  min={1}
                  onChange={(e) => setAddQty(Math.max(1, Number(e.target.value) || 1))}
                  data-testid="input-component-quantity"
                />
                <p className="text-xs text-muted-foreground">
                  How many of this component are included. Leave at 1 unless the package bundles repeats (e.g. 2 road tests).
                </p>
              </div>
            </div>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          data-testid="button-add-component"
        >
          <Plus className="h-4 w-4 mr-1" />
          {createMut.isPending ? "Adding…" : "Add Component"}
        </Button>
      </div>
    </div>
  );
}

export default function PackagesPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [resumePackageId, setResumePackageId] = useState<number | null>(null);
  const search = useSearch();
  const [, setLocationPath] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("create") === "1") {
      setCreateDialogOpen(true);
      params.delete("create");
      const qs = params.toString();
      setLocationPath(`/admin/packages${qs ? `?${qs}` : ""}`, { replace: true });
    }
  }, [search, setLocationPath]);
  const [filterActive, setFilterActive] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterAudience, setFilterAudience] = useState<string>("all");
  const [filterNeedsAttention, setFilterNeedsAttention] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"tiles" | "table">("table");

  const { data: allOfferingsForResume = [] } = useQuery<{ id: number; packageId: number; sessionCount?: number; status?: string }[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/schedule-offerings`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!tenantId,
  });
  const setupStatusByPackage = (() => {
    const m = new Map<number, { cohorts: number; emptyCohorts: number; publishedCohorts: number }>();
    for (const o of allOfferingsForResume) {
      const cur = m.get(o.packageId) ?? { cohorts: 0, emptyCohorts: 0, publishedCohorts: 0 };
      cur.cohorts += 1;
      if ((o.sessionCount ?? 0) === 0) cur.emptyCohorts += 1;
      if (o.status === "PUBLISHED") cur.publishedCohorts += 1;
      m.set(o.packageId, cur);
    }
    return m;
  })();
  function isSetupIncomplete(pkg: PackageType): boolean {
    // SIMPLE packages have no cohorts/sessions to configure — never surface
    // the "Continue setup" affordance for them.
    if (pkg.kind === "SIMPLE") return false;
    const s = setupStatusByPackage.get(pkg.id);
    if (!s) return true;
    return s.cohorts === 0 || s.emptyCohorts > 0;
  }

  function renderKindAndAudienceBadges(pkg: PackageType) {
    const audience = pkg.audience ?? "BOTH";
    const audienceLabel = audience === "TEENS" ? "Teens" : audience === "ADULTS" ? "Adults" : "All Ages";
    const kindLabel = pkg.kind === "SIMPLE" ? "Non-cohort" : "Cohort";
    const language = pkg.language ?? "ENGLISH";
    const languageLabel = language === "SPANISH" ? "Spanish" : "English";
    const tier = pkg.tier ?? "PRIMARY";
    const tierLabel = tier === "AUXILIARY" ? "Auxiliary" : "Primary";
    return (
      <>
        <Badge
          variant={tier === "PRIMARY" ? "default" : "secondary"}
          className="text-xs"
          data-testid={`badge-tier-${pkg.id}`}
        >
          {tierLabel}
        </Badge>
        <Badge
          variant="outline"
          className="text-xs"
          data-testid={`badge-kind-${pkg.id}`}
        >
          {kindLabel}
        </Badge>
        <Badge
          variant="outline"
          className="text-xs"
          data-testid={`badge-audience-${pkg.id}`}
        >
          <Users className="h-3 w-3 mr-1" />
          {audienceLabel}
        </Badge>
        <Badge
          variant="outline"
          className="text-xs"
          data-testid={`badge-language-${pkg.id}`}
        >
          {languageLabel}
        </Badge>
      </>
    );
  }
  // Cohort-based packages with zero PUBLISHED cohorts won't appear bookable
  // on the storefront — surface a clear inline warning to the admin so they
  // can publish or add a cohort.
  function hasNoPublishedCohorts(pkg: PackageType): boolean {
    if (pkg.kind !== "COHORT_BASED") return false;
    if (!pkg.active) return false;
    const s = setupStatusByPackage.get(pkg.id);
    return (s?.publishedCohorts ?? 0) === 0;
  }

  const { data: packages = [], isLoading } = useQuery<PackageType[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: locations = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  type PackageLocationsResponse = Record<string, number[]> & {
    _priceOverrides?: Record<string, Record<string, number>>;
  };
  const { data: packageLocationsResponse = {} as PackageLocationsResponse, isLoading: packageLocationsLoading } = useQuery<PackageLocationsResponse>({
    queryKey: ["/api/tenants", tenantId, "package-locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/package-locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const packageLocationsMap = packageLocationsResponse;
  const priceOverridesByPackage = packageLocationsResponse._priceOverrides ?? {};

  const { data: componentsByPackage = {} as Record<string, PackageComponent[]> } = useQuery<Record<string, PackageComponent[]>>({
    queryKey: ["/api/tenants", tenantId, "package-components"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/package-components`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const locationNameById = new Map<number, string>();
  for (const loc of locations) locationNameById.set(loc.id, loc.name);

  function getPackageLocationIds(pkg: PackageType): number[] {
    const v = packageLocationsMap[String(pkg.id)];
    return Array.isArray(v) ? v : [];
  }

  function getEffectivePricesByLocation(pkg: PackageType) {
    return sharedGetEffectivePricesByLocation({
      pkg,
      locations,
      packageLocationIds: getPackageLocationIds(pkg),
      overrides: priceOverridesByPackage[String(pkg.id)] ?? {},
    });
  }

  function hasMixedPrices(pkg: PackageType): boolean {
    return sharedHasMixedPrices(getEffectivePricesByLocation(pkg));
  }

  function renderScopeBadge(pkg: PackageType) {
    if (pkg.locationScopeMode !== "SPECIFIC_LOCATIONS") {
      return (
        <Badge
          variant="outline"
          className="text-xs"
          data-testid={`badge-scope-${pkg.id}`}
        >
          <Globe className="h-3 w-3 mr-1" />
          All locations
        </Badge>
      );
    }
    if (packageLocationsLoading) {
      return (
        <Badge
          variant="outline"
          className="text-xs"
          data-testid={`badge-scope-${pkg.id}`}
        >
          <MapPin className="h-3 w-3 mr-1" />
          Loading…
        </Badge>
      );
    }
    const ids = getPackageLocationIds(pkg);
    const names = ids
      .map((id) => locationNameById.get(id))
      .filter((n): n is string => !!n);
    const label =
      ids.length === 0
        ? "No locations"
        : `${ids.length} location${ids.length === 1 ? "" : "s"}`;
    const tooltipText =
      names.length > 0 ? names.join(", ") : "No locations selected — package is hidden from the storefront.";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={ids.length === 0 ? "destructive" : "secondary"}
            className="text-xs cursor-default"
            data-testid={`badge-scope-${pkg.id}`}
          >
            <MapPin className="h-3 w-3 mr-1" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent data-testid={`tooltip-scope-${pkg.id}`}>
          <span className="text-xs">{tooltipText}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/tenants/${tenantId}/packages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "package-locations"] });
      toast({ title: "Package deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete package", variant: "destructive" });
    },
  });

  const activeCounts = { active: 0, inactive: 0 };
  packages.forEach(p => { if (p.active) activeCounts.active++; else activeCounts.inactive++; });

  const kindCounts = packages.reduce((acc, p) => {
    const k = p.kind || "COHORT_BASED";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const audienceCounts = packages.reduce((acc, p) => {
    const a = p.audience || "BOTH";
    acc[a] = (acc[a] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const needsAttentionCount = packages.filter(p => isSetupIncomplete(p) || hasNoPublishedCohorts(p)).length;

  const filteredPackages = packages.filter(p => {
    if (filterActive === "active" && !p.active) return false;
    if (filterActive === "inactive" && p.active) return false;
    if (filterKind !== "all" && (p.kind || "COHORT_BASED") !== filterKind) return false;
    if (filterAudience !== "all" && (p.audience || "BOTH") !== filterAudience) return false;
    if (filterNeedsAttention && !(isSetupIncomplete(p) || hasNoPublishedCohorts(p))) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterScope !== "all") {
      if (filterScope === "all-locations") {
        if (p.locationScopeMode !== "ALL_LOCATIONS") return false;
      } else if (filterScope === "specific") {
        if (p.locationScopeMode !== "SPECIFIC_LOCATIONS") return false;
      } else {
        const locId = Number(filterScope);
        if (!Number.isFinite(locId)) return false;
        if (p.locationScopeMode === "ALL_LOCATIONS") return true;
        // Don't hide SPECIFIC_LOCATIONS packages while their location
        // map is still loading; show them so the list doesn't briefly
        // appear empty.
        if (packageLocationsLoading) return true;
        return getPackageLocationIds(p).includes(locId);
      }
    }
    return true;
  });

  const pkgActiveFilterCount =
    (filterActive !== "all" ? 1 : 0) +
    (filterScope !== "all" ? 1 : 0) +
    (filterKind !== "all" ? 1 : 0) +
    (filterAudience !== "all" ? 1 : 0) +
    (filterNeedsAttention ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  function clearPkgFilters() {
    setFilterActive("all");
    setFilterScope("all");
    setFilterKind("all");
    setFilterAudience("all");
    setFilterNeedsAttention(false);
    setSearchQuery("");
  }

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-2xl font-bold">Packages</h1>
        <Button data-testid="button-add-package" onClick={() => { setResumePackageId(null); setCreateDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          {tenantId && hasAddPackageDraft(tenantId) ? "Resume Add Package" : "Add Package"}
        </Button>
        {tenantId && (
          <AddPackageWizard
            tenantId={tenantId}
            open={createDialogOpen}
            onOpenChange={(o) => { setCreateDialogOpen(o); if (!o) setResumePackageId(null); }}
            existingPackageId={resumePackageId}
          />
        )}
      </div>

      {/* Unified filter toolbar */}
      <div className="rounded-lg border bg-card p-3 space-y-3 mb-4" data-testid="filter-pkg-toolbar">
        {/* Row 1: Search + Scope + View toggle + Clear */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search packages…"
              className="pl-8 h-8 text-sm"
              data-testid="input-pkg-search"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-pkg-search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="h-8 w-[170px] text-sm" data-testid="select-pkg-scope-filter">
              <MapPin className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All availability</SelectItem>
              <SelectItem value="all-locations">School-wide</SelectItem>
              <SelectItem value="specific">Location-restricted</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={String(loc.id)} data-testid={`option-pkg-scope-loc-${loc.id}`}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {pkgActiveFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearPkgFilters} data-testid="button-clear-pkg-filters">
              <X className="h-3.5 w-3.5 mr-1" />
              Clear ({pkgActiveFilterCount})
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant={viewMode === "tiles" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("tiles")}
              data-testid="button-view-tiles"
              title="Tile view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("table")}
              data-testid="button-view-table"
              title="Table view"
            >
              <TableIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Row 2: Status chips */}
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="filter-pkg-status-chips">
          <span className="text-xs text-muted-foreground mr-1">Status</span>
          <Button
            variant={filterActive === "all" && !filterNeedsAttention ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => { setFilterActive("all"); setFilterNeedsAttention(false); }}
            data-testid="chip-pkg-all"
          >
            All ({packages.length})
          </Button>
          {activeCounts.active > 0 && (
            <Button
              variant={filterActive === "active" && !filterNeedsAttention ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => { setFilterActive("active"); setFilterNeedsAttention(false); }}
              data-testid="chip-pkg-active"
            >
              Active ({activeCounts.active})
            </Button>
          )}
          {activeCounts.inactive > 0 && (
            <Button
              variant={filterActive === "inactive" && !filterNeedsAttention ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => { setFilterActive("inactive"); setFilterNeedsAttention(false); }}
              data-testid="chip-pkg-inactive"
            >
              Inactive ({activeCounts.inactive})
            </Button>
          )}
          {needsAttentionCount > 0 && (
            <Button
              variant={filterNeedsAttention ? "default" : "outline"}
              size="sm"
              className={`h-7 text-xs px-2.5 ${filterNeedsAttention ? "" : "border-amber-500 text-amber-700 dark:text-amber-400"}`}
              onClick={() => setFilterNeedsAttention(v => !v)}
              data-testid="chip-pkg-needs-attention"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Needs setup ({needsAttentionCount})
            </Button>
          )}
        </div>

        {/* Row 3: Type + Audience (when mixed) */}
        {(Object.keys(kindCounts).length > 1 || Object.keys(audienceCounts).length > 1) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.keys(kindCounts).length > 1 && (
              <>
                <span className="text-xs text-muted-foreground mr-1">Type</span>
                <Button
                  variant={filterKind === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setFilterKind("all")}
                  data-testid="chip-pkg-kind-all"
                >
                  All
                </Button>
                {[
                  { key: "COHORT_BASED", label: "Cohort" },
                  { key: "SIMPLE", label: "Non-cohort" },
                ].filter(k => (kindCounts[k.key] || 0) > 0).map(k => (
                  <Button
                    key={k.key}
                    variant={filterKind === k.key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setFilterKind(k.key)}
                    data-testid={`chip-pkg-kind-${k.key.toLowerCase()}`}
                  >
                    {k.label} ({kindCounts[k.key] || 0})
                  </Button>
                ))}
              </>
            )}
            {Object.keys(audienceCounts).length > 1 && (
              <>
                <span className="text-xs text-muted-foreground ml-2 mr-1">Audience</span>
                <Button
                  variant={filterAudience === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setFilterAudience("all")}
                  data-testid="chip-pkg-audience-all"
                >
                  All
                </Button>
                {[
                  { key: "TEENS", label: "Teens" },
                  { key: "ADULTS", label: "Adults" },
                  { key: "BOTH", label: "All Ages" },
                ].filter(a => (audienceCounts[a.key] || 0) > 0).map(a => (
                  <Button
                    key={a.key}
                    variant={filterAudience === a.key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setFilterAudience(a.key)}
                    data-testid={`chip-pkg-audience-${a.key.toLowerCase()}`}
                  >
                    {a.label} ({audienceCounts[a.key] || 0})
                  </Button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No packages yet. Create your first package.</p>
          </CardContent>
        </Card>
      ) : filteredPackages.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-packages-match">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No packages match the current filters.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={clearPkgFilters} data-testid="button-clear-pkg-filters-empty">
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "table" ? (
        <div className="border rounded-md overflow-x-auto" data-testid="table-packages">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Classroom</TableHead>
                <TableHead className="text-right">Driving</TableHead>
                <TableHead>Ages</TableHead>
                <TableHead>Credits (cls/drv)</TableHead>
                <TableHead>Permit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPackages.map((pkg) => {
                return (
                  <TableRow key={pkg.id} data-testid={`row-package-${pkg.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 min-w-0">
                        {pkg.imageUrl && (
                          <img
                            src={pkg.imageUrl}
                            alt=""
                            className="h-8 w-8 rounded object-cover shrink-0"
                            data-testid={`img-package-row-${pkg.id}`}
                          />
                        )}
                        <Link href={`/admin/packages/${pkg.id}`} className="hover:underline" data-testid={`link-package-row-${pkg.id}`}>
                          {pkg.name}
                        </Link>
                      </div>
                      <span className="ml-2 inline-flex items-center gap-1 align-middle">
                        {renderKindAndAudienceBadges(pkg)}
                      </span>
                      {pkg.availableAsUpsell && <Badge variant="outline" className="ml-2 text-xs">Upsell</Badge>}
                      {hasNoPublishedCohorts(pkg) && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-xs border-amber-500 text-amber-700 dark:text-amber-400"
                          data-testid={`badge-no-published-cohorts-${pkg.id}`}
                        >
                          No published cohorts
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pkg.active ? "default" : "secondary"}>
                        {pkg.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {renderScopeBadge(pkg)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {hasMixedPrices(pkg) ? (
                        <div className="flex flex-col items-end gap-0.5" data-testid={`prices-by-location-row-${pkg.id}`}>
                          {getEffectivePricesByLocation(pkg).map((r) => (
                            <div key={r.locationId} className="text-xs">
                              <span className="text-muted-foreground">{r.name}:</span>{" "}
                              <span className="font-medium">${(r.cents / 100).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>${(pkg.price / 100).toFixed(2)}</>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {(pkg.classroomHoursRequired ?? 0) > 0 ? `${pkg.classroomHoursRequired}h` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {(pkg.driveHoursRequired ?? 0) > 0 ? `${pkg.driveHoursRequired}h` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(pkg.ageMin || pkg.ageMax)
                        ? `${pkg.ageMin ?? "any"}-${pkg.ageMax ?? "any"}`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {((pkg.creditClassroom ?? 0) > 0 || (pkg.creditDrive ?? 0) > 0)
                        ? `${pkg.creditClassroom ?? 0} / ${pkg.creditDrive ?? 0}`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {pkg.requiresPermit
                        ? <Badge variant="outline"><Shield className="h-3 w-3 mr-1" /> Yes</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link href={`/admin/packages/${pkg.id}`}>
                          <Button size="icon" variant="ghost" data-testid={`button-open-package-row-${pkg.id}`} title="Open">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-delete-package-row-${pkg.id}`} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Package</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{pkg.name}"? This action cannot be undone. Any enrollments linked to this package will also be removed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(pkg.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pkg) => {
            return (
              <Card key={pkg.id} data-testid={`card-package-${pkg.id}`} className="relative flex flex-col">
                {pkg.imageUrl && (
                  <div className="h-32 overflow-hidden rounded-t-lg">
                    <img
                      src={pkg.imageUrl}
                      alt={pkg.name}
                      className="w-full h-full object-cover"
                      data-testid={`img-package-${pkg.id}`}
                    />
                  </div>
                )}
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-base leading-tight min-w-0 flex-1">
                    <Link href={`/admin/packages/${pkg.id}`} className="hover:underline break-words" data-testid={`link-package-${pkg.id}`}>
                      {pkg.name}
                    </Link>
                  </CardTitle>
                  <div className="flex items-center gap-0.5 -mr-2 -mt-1 shrink-0">
                    {isSetupIncomplete(pkg) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => { setResumePackageId(pkg.id); setCreateDialogOpen(true); }}
                            data-testid={`button-resume-package-${pkg.id}`}
                          >
                            <PlayCircle className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span className="text-xs">
                            Continue setup — {(setupStatusByPackage.get(pkg.id)?.cohorts ?? 0) === 0
                              ? "no cohorts yet"
                              : "some cohorts have no sessions"}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Link href={`/admin/packages/${pkg.id}`}>
                      <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-open-package-${pkg.id}`} title="Open">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          data-testid={`button-delete-package-${pkg.id}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Package</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{pkg.name}"? This action cannot be undone. Any enrollments linked to this package will also be removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(pkg.id)}
                            data-testid="button-confirm-delete"
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
                    <Badge variant={pkg.active ? "default" : "secondary"} className="text-xs">
                      {pkg.active ? "Active" : "Inactive"}
                    </Badge>
                    {renderKindAndAudienceBadges(pkg)}
                    {renderScopeBadge(pkg)}
                    {pkg.requiresPermit && (
                      <Badge variant="outline" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" /> Permit
                      </Badge>
                    )}
                    {hasNoPublishedCohorts(pkg) && (
                      <Badge
                        variant="outline"
                        className="text-xs border-amber-500 text-amber-700 dark:text-amber-400"
                        data-testid={`badge-no-published-cohorts-card-${pkg.id}`}
                      >
                        No published cohorts
                      </Badge>
                    )}
                  </div>

                  {pkg.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{pkg.description}</p>
                  )}

                  {(() => {
                    const comps = componentsByPackage[String(pkg.id)] ?? [];
                    if (comps.length === 0) return null;
                    return (
                      <div className="space-y-1" data-testid={`components-card-${pkg.id}`}>
                        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Boxes className="h-3 w-3" />
                          Components
                        </div>
                        <ul className="space-y-0.5">
                          {comps.map((c) => {
                            const def = COMPONENT_TYPES.find((t) => t.value === c.type);
                            const Icon = def?.icon ?? Boxes;
                            const detail = [
                              (c.hours ?? 0) > 0 ? `${c.hours} ${def?.hoursLabel.toLowerCase()}` : null,
                              (c.quantity ?? 1) > 1 ? `qty ${c.quantity}` : null,
                            ].filter(Boolean).join(" · ");
                            return (
                              <li
                                key={c.id}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                                data-testid={`component-card-${pkg.id}-${c.id}`}
                              >
                                <Icon className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  <span className="text-foreground">{c.label || def?.label}</span>
                                  {detail && <span className="text-muted-foreground"> · {detail}</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}

                  {hasMixedPrices(pkg) ? (
                    <div className="space-y-0.5 text-sm" data-testid={`prices-by-location-card-${pkg.id}`}>
                      {getEffectivePricesByLocation(pkg).map((r) => (
                        <div key={r.locationId} className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-muted-foreground truncate">{r.name}</span>
                          <span className="font-semibold tabular-nums">${(r.cents / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-2xl font-semibold tabular-nums" data-testid={`text-price-${pkg.id}`}>
                      ${(pkg.price / 100).toFixed(2)}
                    </div>
                  )}

                  {(() => {
                    const meta: React.ReactNode[] = [];
                    if ((pkg.classroomHoursRequired ?? 0) > 0) {
                      meta.push(<span key="cls" className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.classroomHoursRequired}h class</span>);
                    }
                    if ((pkg.driveHoursRequired ?? 0) > 0) {
                      meta.push(<span key="drv" className="inline-flex items-center gap-1"><Car className="h-3 w-3" />{pkg.driveHoursRequired}h drive</span>);
                    }
                    if (pkg.ageMin || pkg.ageMax) {
                      meta.push(<span key="age" className="inline-flex items-center gap-1"><Users className="h-3 w-3" />Ages {pkg.ageMin ?? "any"}-{pkg.ageMax ?? "any"}</span>);
                    }
                    if ((pkg.creditClassroom ?? 0) > 0 || (pkg.creditDrive ?? 0) > 0) {
                      meta.push(<span key="cred">{pkg.creditClassroom ?? 0}/{pkg.creditDrive ?? 0} credits</span>);
                    }
                    if (meta.length === 0) return null;
                    return (
                      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {meta.map((node, i) => (
                          <span key={i} className="inline-flex items-center gap-2">
                            {node}
                            {i < meta.length - 1 && <span aria-hidden className="text-muted-foreground/50">·</span>}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
