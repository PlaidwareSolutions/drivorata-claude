import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { Megaphone, Phone, X, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Pin } from "lucide-react";
import type { TenantAnnouncement } from "@shared/schema";

const PRESETS = [
  { label: "Slate (default)", bg: "#0f172a", text: "#ffffff" },
  { label: "Brand Blue", bg: "#1d4ed8", text: "#ffffff" },
  { label: "Emerald", bg: "#047857", text: "#ffffff" },
  { label: "Amber", bg: "#b45309", text: "#ffffff" },
  { label: "Crimson", bg: "#b91c1c", text: "#ffffff" },
  { label: "Light", bg: "#f1f5f9", text: "#0f172a" },
];

const formSchema = z.object({
  title: z.string().max(80).optional().nullable(),
  enabled: z.boolean().default(false),
  message: z.string().max(280, "Keep it under 280 characters"),
  ctaLabel: z.string().max(40).optional().nullable(),
  ctaHref: z.string().max(500).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB color"),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB color"),
  dismissable: z.boolean().default(true),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULTS: FormValues = {
  title: "",
  enabled: true,
  message: "",
  ctaLabel: "",
  ctaHref: "",
  phone: "",
  bgColor: "#0f172a",
  textColor: "#ffffff",
  dismissable: true,
  validFrom: "",
  validUntil: "",
};

function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const tzOffset = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - tzOffset).toISOString().slice(0, 16);
}

type Status = "live" | "scheduled" | "expired" | "disabled" | "empty";

function statusOf(a: TenantAnnouncement, activeId: number | null): Status {
  if (!a.enabled) return "disabled";
  if (!a.message || a.message.trim().length === 0) return "empty";
  const now = new Date();
  if (a.validFrom && new Date(a.validFrom) > now) return "scheduled";
  if (a.validUntil && new Date(a.validUntil) < now) return "expired";
  return activeId === a.id ? "live" : "scheduled";
}

const STATUS_META: Record<Status, { label: string; className: string }> = {
  live: { label: "Live now", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
  scheduled: { label: "Scheduled", className: "bg-blue-600 text-white hover:bg-blue-600" },
  expired: { label: "Past", className: "bg-zinc-400 text-white hover:bg-zinc-400" },
  disabled: { label: "Off", className: "bg-orange-500 text-white hover:bg-orange-500" },
  empty: { label: "No message", className: "bg-zinc-300 text-zinc-700 hover:bg-zinc-300" },
};

function formatDateRange(a: TenantAnnouncement): string {
  const parts: string[] = [];
  if (a.validFrom) parts.push(`from ${new Date(a.validFrom).toLocaleString()}`);
  if (a.validUntil) parts.push(`until ${new Date(a.validUntil).toLocaleString()}`);
  if (parts.length === 0) return "Always";
  return parts.join(" · ");
}

export default function AnnouncementPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;

  const [editing, setEditing] = useState<TenantAnnouncement | null>(null);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TenantAnnouncement | null>(null);

  const { data, isLoading } = useQuery<{ items: TenantAnnouncement[]; activeId: number | null }>({
    queryKey: ["/api/tenants", tenantId, "announcements"],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/announcements`, { credentials: "include" }).then((r) =>
        r.json(),
      ),
    enabled: !!tenantId,
  });

  const items = data?.items ?? [];
  const activeId = data?.activeId ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "announcements"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "announcement"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/announcements/${id}`),
    onSuccess: () => {
      toast({ title: "Announcement deleted" });
      invalidate();
      setConfirmDelete(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: Array<{ id: number; priority: number }>) => {
      for (const u of updates) {
        await apiRequest(
          "PATCH",
          `/api/tenants/${tenantId}/announcements/${u.id}`,
          { priority: u.priority },
        );
      }
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
  });

  const swapWithNeighbor = (index: number, direction: -1 | 1) => {
    const target = items[index];
    const neighbor = items[index + direction];
    if (!target || !neighbor) return;
    const tp = target.priority ?? 0;
    const np = neighbor.priority ?? 0;
    if (tp === np) {
      // Re-stripe priorities so the swap is visible.
      const restriped = items.map((it, i) => {
        const newIdx =
          i === index ? index + direction : i === index + direction ? index : i;
        return { id: it.id, priority: items.length - newIdx };
      });
      reorderMutation.mutate(restriped);
    } else {
      reorderMutation.mutate([
        { id: target.id, priority: np },
        { id: neighbor.id, priority: tp },
      ]);
    }
  };

  const pinToTop = (index: number) => {
    const target = items[index];
    if (!target) return;
    const maxPriority = items.reduce(
      (m, a) => Math.max(m, a.priority ?? 0),
      0,
    );
    if ((target.priority ?? 0) >= maxPriority && index === 0) return;
    reorderMutation.mutate([{ id: target.id, priority: maxPriority + 1 }]);
  };

  if (!currentTenant) return null;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            data-testid="text-announcement-title"
          >
            <Megaphone className="h-6 w-6" />
            Announcement Banners
          </h1>
          <p className="text-muted-foreground mt-1">
            Schedule banners ahead of time. Only one shows at the top of your storefront at a
            time — when several are eligible, the one at the top of this list wins. Use the
            arrows or "Pin to top" to control which banner takes over.
          </p>
        </div>
        <Button
          onClick={() => setCreatingOpen(true)}
          data-testid="button-add-announcement"
        >
          <Plus className="h-4 w-4 mr-2" />
          New announcement
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Banners</CardTitle>
          <CardDescription>
            Each row is a saved banner. The one tagged "Live now" is the one your visitors see
            right this moment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3" data-testid="loading-announcements">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div
              className="text-sm text-muted-foreground border border-dashed rounded p-8 text-center"
              data-testid="text-empty-announcements"
            >
              No announcements yet. Create one to start showing a banner at the top of your site.
            </div>
          ) : (
            <ul className="space-y-3" data-testid="list-announcements">
              {items.map((a, index) => {
                const status = statusOf(a, activeId);
                const meta = STATUS_META[status];
                const isFirst = index === 0;
                const isLast = index === items.length - 1;
                return (
                  <li
                    key={a.id}
                    className="border rounded-md p-4 flex flex-col md:flex-row md:items-center gap-3"
                    data-testid={`row-announcement-${a.id}`}
                  >
                    <div className="flex flex-col gap-1 md:pr-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => swapWithNeighbor(index, -1)}
                        disabled={isFirst || reorderMutation.isPending}
                        aria-label="Move up"
                        data-testid={`button-move-up-${a.id}`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => swapWithNeighbor(index, 1)}
                        disabled={isLast || reorderMutation.isPending}
                        aria-label="Move down"
                        data-testid={`button-move-down-${a.id}`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={meta.className}
                          data-testid={`status-announcement-${a.id}`}
                        >
                          {meta.label}
                        </Badge>
                        <span
                          className="font-medium truncate"
                          data-testid={`text-title-${a.id}`}
                        >
                          {a.title?.trim() || "Untitled banner"}
                        </span>
                      </div>
                      <div
                        className="rounded text-sm flex items-center gap-3 px-3 py-2"
                        style={{ backgroundColor: a.bgColor, color: a.textColor }}
                        data-testid={`preview-announcement-${a.id}`}
                      >
                        <span className="truncate">
                          {a.message?.trim() || <em className="opacity-70">No message</em>}
                        </span>
                        {a.ctaLabel?.trim() && (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-semibold"
                            style={{ backgroundColor: a.textColor, color: a.bgColor }}
                          >
                            {a.ctaLabel}
                          </span>
                        )}
                      </div>
                      <div
                        className="text-xs text-muted-foreground"
                        data-testid={`text-schedule-${a.id}`}
                      >
                        {formatDateRange(a)}
                      </div>
                    </div>
                    <div className="flex gap-2 md:flex-col md:items-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pinToTop(index)}
                        disabled={isFirst || reorderMutation.isPending}
                        data-testid={`button-pin-${a.id}`}
                      >
                        <Pin className="h-3 w-3 mr-1" />
                        Pin to top
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(a)}
                        data-testid={`button-edit-${a.id}`}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(a)}
                        data-testid={`button-delete-${a.id}`}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AnnouncementDialog
        open={creatingOpen}
        onOpenChange={(o) => setCreatingOpen(o)}
        tenantId={tenantId!}
        onSaved={invalidate}
      />
      <AnnouncementDialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        tenantId={tenantId!}
        existing={editing ?? undefined}
        onSaved={invalidate}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the saved banner. If it's currently live on your site,
              the next scheduled or live banner will take over.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AnnouncementDialog({
  open,
  onOpenChange,
  tenantId,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  existing?: TenantAnnouncement;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (existing) {
      form.reset({
        title: existing.title ?? "",
        enabled: existing.enabled,
        message: existing.message ?? "",
        ctaLabel: existing.ctaLabel ?? "",
        ctaHref: existing.ctaHref ?? "",
        phone: existing.phone ?? "",
        bgColor: existing.bgColor || "#0f172a",
        textColor: existing.textColor || "#ffffff",
        dismissable: existing.dismissable,
        validFrom: toDateInput(existing.validFrom),
        validUntil: toDateInput(existing.validUntil),
      });
    } else {
      form.reset(DEFAULTS);
    }
  }, [open, existing, form]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...values,
        title: values.title?.trim() || null,
        ctaLabel: values.ctaLabel?.trim() || null,
        ctaHref: values.ctaHref?.trim() || null,
        phone: values.phone?.trim() || null,
        validFrom: values.validFrom ? new Date(values.validFrom).toISOString() : null,
        validUntil: values.validUntil ? new Date(values.validUntil).toISOString() : null,
      };
      if (isEdit) {
        return apiRequest(
          "PATCH",
          `/api/tenants/${tenantId}/announcements/${existing!.id}`,
          payload,
        );
      }
      return apiRequest("POST", `/api/tenants/${tenantId}/announcements`, payload);
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Announcement updated" : "Announcement created" });
      onSaved();
      onOpenChange(false);
    },
    onError: async (err: any) => {
      let msg = "Failed to save";
      try {
        const parsed = JSON.parse(err?.message?.split(": ").slice(1).join(": ") || "{}");
        if (parsed?.message) msg = parsed.message;
      } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const watched = form.watch();
  const previewMessage = watched.message?.trim() || "Your announcement message will appear here";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {isEdit ? "Edit announcement" : "New announcement"}
          </DialogTitle>
          <DialogDescription>
            Set the wording and an optional schedule. Only one banner shows at a time on your
            storefront — when this one's start time arrives it automatically replaces the current
            one.
          </DialogDescription>
        </DialogHeader>

        <div
          className="w-full text-sm flex items-center gap-3 px-3 py-2 rounded"
          style={{ backgroundColor: watched.bgColor, color: watched.textColor }}
          data-testid="banner-preview"
        >
          <span className="truncate" data-testid="preview-message">
            {previewMessage}
          </span>
          {watched.phone?.trim() && (
            <span className="inline-flex items-center gap-1 underline opacity-90">
              <Phone className="h-3 w-3" />
              {watched.phone}
            </span>
          )}
          {watched.ctaLabel?.trim() && (
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
              style={{ backgroundColor: watched.textColor, color: watched.bgColor }}
              data-testid="preview-cta"
            >
              {watched.ctaLabel}
            </span>
          )}
          {watched.dismissable && (
            <span
              className="ml-auto opacity-80"
              aria-label="Dismiss preview"
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
            className="space-y-5"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal title (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Holiday hours, Spring sale, etc."
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormDescription>Just a label for your team — never shown to visitors.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded border p-3">
                  <div>
                    <FormLabel className="text-base">Eligible to show</FormLabel>
                    <FormDescription>
                      Turn off to keep the wording but pause this one. Disabled banners never go
                      live, even when their start time arrives.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-enabled"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enroll Today — Limited Spots Available!"
                      rows={2}
                      data-testid="input-message"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ctaLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Call-to-action label (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Enroll Now"
                        data-testid="input-cta-label"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ctaHref"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Call-to-action link (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="/packages or https://..."
                        data-testid="input-cta-href"
                      />
                    </FormControl>
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
                  <FormLabel>Click-to-call phone (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="(512) 555-0100"
                      data-testid="input-phone"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel className="mb-2 block">Color presets</FormLabel>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      form.setValue("bgColor", p.bg, { shouldDirty: true });
                      form.setValue("textColor", p.text, { shouldDirty: true });
                    }}
                    className="px-3 py-1 rounded text-xs font-medium border"
                    style={{ backgroundColor: p.bg, color: p.text, borderColor: p.text }}
                    data-testid={`button-preset-${p.label.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bgColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Background color</FormLabel>
                      <FormControl>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="color"
                            className="w-14 h-10 p-1"
                            value={field.value}
                            onChange={field.onChange}
                            data-testid="input-bg-color-picker"
                          />
                          <Input
                            {...field}
                            placeholder="#0f172a"
                            data-testid="input-bg-color"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="textColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Text color</FormLabel>
                      <FormControl>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="color"
                            className="w-14 h-10 p-1"
                            value={field.value}
                            onChange={field.onChange}
                            data-testid="input-text-color-picker"
                          />
                          <Input
                            {...field}
                            placeholder="#ffffff"
                            data-testid="input-text-color"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="dismissable"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded border p-3">
                  <div>
                    <FormLabel className="text-base">Allow visitors to dismiss</FormLabel>
                    <FormDescription>
                      Adds a small "X" so visitors can close the banner.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-dismissable"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Show from (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        data-testid="input-valid-from"
                      />
                    </FormControl>
                    <FormDescription>
                      Leave blank to show right away. Set a future date to stage this banner — it
                      automatically replaces whatever is live at that time.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="validUntil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Show until (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        data-testid="input-valid-until"
                      />
                    </FormControl>
                    <FormDescription>Leave blank to keep showing.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-announcement"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-announcement"
              >
                {saveMutation.isPending
                  ? "Saving..."
                  : isEdit
                    ? "Save changes"
                    : "Create announcement"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
