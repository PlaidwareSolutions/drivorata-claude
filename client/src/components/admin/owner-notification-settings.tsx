import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Who gets the owner's enrollment emails (PAID / CASH DUE / NOT PAID) and
// whether abandoned card checkouts are reported. Server:
// /api/tenants/:id/admin-enrollment-notifications/settings.

interface OwnerNotificationSettings {
  enabled: boolean;
  extraRecipients: string[];
  notifyAbandonedCheckouts: boolean;
}

export function OwnerNotificationSettingsCard({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const queryKey = ["/api/tenants", tenantId, "owner-notification-settings"];
  const { data } = useQuery<OwnerNotificationSettings>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", `/api/tenants/${tenantId}/admin-enrollment-notifications/settings`)).json(),
  });
  const [recipients, setRecipients] = useState("");
  useEffect(() => {
    if (data) setRecipients(data.extraRecipients.join(", "));
  }, [data]);

  const save = useMutation({
    mutationFn: async (patch: Partial<OwnerNotificationSettings>) =>
      (await apiRequest("PATCH", `/api/tenants/${tenantId}/admin-enrollment-notifications/settings`, patch)).json(),
    onSuccess: (next: OwnerNotificationSettings) => {
      queryClient.setQueryData(queryKey, next);
      toast({ title: "Notification settings saved" });
    },
    onError: (err) =>
      toast({ title: "Could not save", description: err instanceof Error ? err.message : String(err), variant: "destructive" }),
  });

  if (!data) return null;
  const parsed = recipients.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
  const changed = parsed.join(",") !== data.extraRecipients.join(",");

  return (
    <Card data-testid="card-owner-notifications">
      <CardHeader>
        <CardTitle>Enrollment notifications to the school</CardTitle>
        <CardDescription>
          Every email starts with its status — <strong>PAID</strong>, <strong>CASH DUE</strong> or{" "}
          <strong>NOT PAID</strong> — so a checkout that was started but never paid can't be mistaken for an enrollment.
          They go to all admins and office managers, plus the addresses below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="owner-notify-enabled" className="font-normal">Send enrollment notifications</Label>
          <Switch
            id="owner-notify-enabled"
            checked={data.enabled}
            onCheckedChange={(enabled) => save.mutate({ enabled })}
            data-testid="switch-owner-notify-enabled"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="owner-notify-recipients">Also send to</Label>
          <div className="flex gap-2">
            <Input
              id="owner-notify-recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="owner@example.com, frontdesk@example.com"
              disabled={!data.enabled}
              data-testid="input-owner-notify-recipients"
            />
            <Button
              variant="outline"
              disabled={!changed || save.isPending}
              onClick={() => save.mutate({ extraRecipients: parsed })}
              data-testid="button-save-owner-recipients"
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Separate addresses with commas. Up to 10.</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="owner-notify-abandoned" className="font-normal leading-snug">
            Tell me about card checkouts that weren't paid
            <span className="block text-xs text-muted-foreground">
              A NOT PAID email with the customer's contact details, about an hour after they stop, so you can follow up.
            </span>
          </Label>
          <Switch
            id="owner-notify-abandoned"
            checked={data.notifyAbandonedCheckouts}
            disabled={!data.enabled}
            onCheckedChange={(notifyAbandonedCheckouts) => save.mutate({ notifyAbandonedCheckouts })}
            data-testid="switch-owner-notify-abandoned"
          />
        </div>
      </CardContent>
    </Card>
  );
}
