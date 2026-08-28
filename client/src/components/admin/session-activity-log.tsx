import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Activity } from "lucide-react";

interface Props {
  tenantId: number;
  sessionId: number;
}

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  email_sent: "Email Sent",
  email_failed: "Email Failed",
  email_skipped: "Email Skipped (no provider)",
  booking_moved: "Booking Moved",
  btw_scheduled: "BTW Scheduled",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "default",
  queued: "secondary",
  skipped_no_provider: "outline",
  failed: "destructive",
};

export function SessionActivityLog({ tenantId, sessionId }: Props) {
  const { data, isLoading } = useQuery<{ activity: any[]; emails: any[] }>({
    queryKey: ["/api/tenants", tenantId, "sessions", String(sessionId), "activity"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/sessions/${sessionId}/activity`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  if (isLoading) return null;
  const activity = data?.activity || [];
  const emails = data?.emails || [];
  if (activity.length === 0 && emails.length === 0) return null;

  return (
    <Card className="mt-4" data-testid="card-session-activity">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-5 w-5" /> Activity & Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activity.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Activity</p>
            <div className="space-y-1.5">
              {activity.map((a: any) => (
                <div key={a.id} className="text-sm border rounded-md px-3 py-2 flex items-start justify-between gap-2" data-testid={`activity-${a.id}`}>
                  <div className="flex items-start gap-2 min-w-0">
                    <Badge variant="outline" className="text-xs">{ACTION_LABELS[a.action] || a.action}</Badge>
                    <span className="text-muted-foreground">{a.message}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {emails.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Emails</p>
            <div className="space-y-1.5">
              {emails.map((e: any) => (
                <div key={e.id} className="text-sm border rounded-md px-3 py-2 flex items-start justify-between gap-2" data-testid={`email-${e.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[e.status] || "outline"} className="text-xs">{e.status}</Badge>
                      <span className="text-sm font-medium truncate">{e.recipientEmail}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{e.subject}</p>
                    {e.errorMsg && <p className="text-xs text-destructive">{e.errorMsg}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
