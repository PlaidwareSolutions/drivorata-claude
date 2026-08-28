import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const fontOptions = [
  "Inter",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Plus Jakarta Sans",
  "DM Sans",
  "Outfit",
  "Space Grotesk",
  "Lora",
  "Playfair Display",
  "Merriweather",
];

export default function ThemePage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;

  const { data: theme, isLoading } = useQuery({
    queryKey: ["/api/tenants", tenantId, "theme"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/theme`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const form = useForm({
    values: {
      primaryColor: theme?.primaryColor || "#2563eb",
      secondaryColor: theme?.secondaryColor || "#64748b",
      accentColor: theme?.accentColor || "#f59e0b",
      backgroundColor: theme?.backgroundColor || "#ffffff",
      textColor: theme?.textColor || "#1e293b",
      fontFamily: theme?.fontFamily || "Inter",
      headingFont: theme?.headingFont || "Inter",
      borderRadius: theme?.borderRadius || "8px",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/tenants/${tenantId}/theme`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "theme"] });
      toast({ title: "Theme saved" });
    },
    onError: () => {
      toast({ title: "Failed to save theme", variant: "destructive" });
    },
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const watchedValues = form.watch();

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Theme Customization</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Colors & Fonts</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={field.value}
                              onChange={field.onChange}
                              className="h-9 w-9 rounded-md border cursor-pointer"
                              data-testid="input-primary-color"
                            />
                            <Input {...field} className="flex-1" />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="secondaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={field.value}
                              onChange={field.onChange}
                              className="h-9 w-9 rounded-md border cursor-pointer"
                              data-testid="input-secondary-color"
                            />
                            <Input {...field} className="flex-1" />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accentColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accent Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={field.value}
                              onChange={field.onChange}
                              className="h-9 w-9 rounded-md border cursor-pointer"
                              data-testid="input-accent-color"
                            />
                            <Input {...field} className="flex-1" />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="backgroundColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Background</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={field.value}
                              onChange={field.onChange}
                              className="h-9 w-9 rounded-md border cursor-pointer"
                              data-testid="input-bg-color"
                            />
                            <Input {...field} className="flex-1" />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="textColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={field.value}
                              onChange={field.onChange}
                              className="h-9 w-9 rounded-md border cursor-pointer"
                              data-testid="input-text-color"
                            />
                            <Input {...field} className="flex-1" />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="fontFamily"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body Font</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-body-font">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fontOptions.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="headingFont"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Heading Font</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-heading-font">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fontOptions.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save-theme">
                  {mutation.isPending ? "Saving..." : "Save Theme"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="rounded-md border p-4 space-y-3"
              style={{
                backgroundColor: watchedValues.backgroundColor,
                color: watchedValues.textColor,
                fontFamily: watchedValues.fontFamily,
              }}
            >
              <h3
                className="text-xl font-bold"
                style={{ fontFamily: watchedValues.headingFont }}
              >
                {currentTenant.tenant.name}
              </h3>
              <p className="text-sm opacity-70">
                Welcome to our driving school. We offer comprehensive driver education programs.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: watchedValues.primaryColor }}
                >
                  Primary Button
                </button>
                <button
                  className="px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: watchedValues.secondaryColor }}
                >
                  Secondary
                </button>
                <button
                  className="px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: watchedValues.accentColor }}
                >
                  Accent
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
