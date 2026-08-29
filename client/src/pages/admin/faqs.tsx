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
import { HelpCircle, Plus, Pencil, Trash2, EyeOff } from "lucide-react";
import { useState } from "react";
import type { Faq } from "@shared/schema";

const CATEGORY_OPTIONS = [
  { value: "packages", label: "Packages" },
  { value: "resources", label: "Resources / FAQ" },
  { value: "road-test", label: "Road Test" },
  { value: "contact", label: "Contact" },
] as const;

type FaqCategory = "packages" | "resources" | "road-test" | "contact";

const faqSchema = z.object({
  question: z.string().min(1, "Question is required"),
  answer: z.string().min(1, "Answer is required"),
  category: z.enum(["packages", "resources", "road-test", "contact"]),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

type FaqFormValues = z.infer<typeof faqSchema>;

const defaultValues: FaqFormValues = {
  question: "",
  answer: "",
  category: "resources",
  sortOrder: 0,
  isActive: true,
};

function categoryLabel(cat: FaqCategory): string {
  return CATEGORY_OPTIONS.find((o) => o.value === cat)?.label ?? cat;
}

function categoryColor(cat: FaqCategory): string {
  switch (cat) {
    case "packages": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    case "resources": return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "road-test": return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
    case "contact": return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300";
    default: return "bg-slate-100 text-slate-800";
  }
}

function FaqFormDialog({
  children,
  faq,
  tenantId,
  onClose,
}: {
  children: React.ReactNode;
  faq?: Faq;
  tenantId: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const isEdit = !!faq;

  const form = useForm<FaqFormValues>({
    resolver: zodResolver(faqSchema),
    defaultValues: faq
      ? {
          question: faq.question,
          answer: faq.answer,
          category: faq.category as FaqCategory,
          sortOrder: faq.sortOrder,
          isActive: faq.isActive,
        }
      : defaultValues,
  });

  const mutation = useMutation({
    mutationFn: async (values: FaqFormValues) => {
      if (isEdit) {
        return apiRequest("PATCH", `/api/tenants/${tenantId}/faqs/${faq.id}`, values);
      }
      return apiRequest("POST", `/api/tenants/${tenantId}/faqs`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${tenantId}/faqs`] });
      toast({ title: isEdit ? "FAQ updated" : "FAQ created" });
      setOpen(false);
      form.reset(defaultValues);
      onClose();
    },
    onError: () => {
      toast({ title: isEdit ? "Failed to update FAQ" : "Failed to create FAQ", variant: "destructive" });
    },
  });

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      form.reset(faq ? {
        question: faq.question,
        answer: faq.answer,
        category: faq.category as FaqCategory,
        sortOrder: faq.sortOrder,
        isActive: faq.isActive,
      } : defaultValues);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-faq-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-faq-question" placeholder="e.g. What's included in each package?" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="answer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Answer</FormLabel>
                  <FormControl>
                    <Textarea {...field} data-testid="input-faq-answer" rows={5} placeholder="Enter the full answer..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        data-testid="input-faq-sort-order"
                        placeholder="0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end pb-1">
                    <FormLabel>Active</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-faq-active"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-faq-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-faq-save">
                {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create FAQ"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function FaqsPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;

  const { data: faqList, isLoading } = useQuery<Faq[]>({
    queryKey: [`/api/tenants/${tenantId}/faqs`],
    enabled: !!tenantId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/tenants/${tenantId}/faqs/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${tenantId}/faqs`] });
    },
    onError: () => {
      toast({ title: "Failed to update FAQ", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/faqs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${tenantId}/faqs`] });
      toast({ title: "FAQ deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete FAQ", variant: "destructive" });
    },
  });

  const grouped = CATEGORY_OPTIONS.map((cat) => ({
    ...cat,
    items: (faqList ?? []).filter((f) => f.category === cat.value),
  }));

  if (!tenantId) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            FAQs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage frequently asked questions displayed on your storefront.
          </p>
        </div>
        <FaqFormDialog tenantId={tenantId} onClose={() => {}}>
          <Button data-testid="button-add-faq">
            <Plus className="h-4 w-4 mr-2" />
            Add FAQ
          </Button>
        </FaqFormDialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.value}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </h2>
                <span className="text-xs text-muted-foreground">({group.items.length})</span>
              </div>

              {group.items.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No FAQs in this category yet.{" "}
                    <FaqFormDialog tenantId={tenantId} onClose={() => {}}>
                      <button className="underline text-primary hover:opacity-80">Add one</button>
                    </FaqFormDialog>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {group.items.map((faq) => (
                    <Card
                      key={faq.id}
                      className={`transition-opacity ${faq.isActive ? "" : "opacity-60"}`}
                      data-testid={`card-faq-${faq.id}`}
                    >
                      <CardContent className="py-4 px-5">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${categoryColor(faq.category as FaqCategory)}`}
                                data-testid={`badge-category-${faq.id}`}
                              >
                                {categoryLabel(faq.category as FaqCategory)}
                              </span>
                              {!faq.isActive && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  <EyeOff className="h-3 w-3" />
                                  Hidden
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">#{faq.sortOrder}</span>
                            </div>
                            <p className="font-medium text-sm" data-testid={`text-faq-question-${faq.id}`}>
                              {faq.question}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2" data-testid={`text-faq-answer-${faq.id}`}>
                              {faq.answer}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch
                              checked={faq.isActive}
                              onCheckedChange={(v) => toggleMutation.mutate({ id: faq.id, isActive: v })}
                              data-testid={`switch-active-${faq.id}`}
                              title={faq.isActive ? "Hide this FAQ" : "Show this FAQ"}
                            />
                            <FaqFormDialog faq={faq} tenantId={tenantId} onClose={() => {}}>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-edit-faq-${faq.id}`}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </FaqFormDialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-delete-faq-${faq.id}`}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete FAQ?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    "{faq.question}" will be permanently removed from your storefront.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(faq.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    data-testid={`button-confirm-delete-faq-${faq.id}`}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
