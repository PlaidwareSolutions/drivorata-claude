import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Props {
  tenantId: number;
  session: any;
  bookings: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelRescheduleDialog({ tenantId, session, bookings, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [newInstructorId, setNewInstructorId] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState("Your session has been rescheduled");
  const [emailBody, setEmailBody] = useState("");

  const { data: instructors } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "members", "instructors"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/members?role=instructor`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
  });

  const recipients = Array.from(new Set(
    (bookings || [])
      .filter((b: any) => b.status === "BOOKED")
      .flatMap((b: any) => [b.enrollment?.email, b.enrollment?.parentEmail])
      .filter((e: any) => !!e)
  ));

  const dateInvalid = !!(newStartAt && newEndAt && new Date(newEndAt) <= new Date(newStartAt));

  useEffect(() => {
    if (!open) return;
    if (emailBody) return;
    if (!newStartAt) return;
    setEmailBody(`Hello,\n\nYour driving school session has been rescheduled to ${new Date(newStartAt).toLocaleString()}. Please update your calendar and reach out if you have any questions.\n\nThank you,\nYour driving school team`);
  }, [open, newStartAt]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = emailBody || `Your driving school session has been rescheduled to ${new Date(newStartAt).toLocaleString()}. Please update your calendar.`;
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/sessions/${session.id}/cancel-and-reschedule`, {
        newStartAt: new Date(newStartAt).toISOString(),
        newEndAt: new Date(newEndAt).toISOString(),
        newInstructorId: newInstructorId || null,
        emailSubject,
        emailBody: body,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const sentCount = (data.emails || []).filter((e: any) => e.status === "sent").length;
      const queuedCount = (data.emails || []).filter((e: any) => e.status === "skipped_no_provider").length;
      toast({
        title: "Session rescheduled",
        description: `New session #${data.newSession?.id}. ${sentCount} email(s) sent${queuedCount ? `, ${queuedCount} queued (no provider)` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions", session.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions", String(session.id)] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions", String(session.id), "activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions", session.id, "bookings"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Could not reschedule", description: e?.message || "Error", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel & Reschedule Session</DialogTitle>
          <DialogDescription>
            Cancels session #{session.id}, creates a new session at the new time, and moves all active bookings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>New Start</Label>
              <Input type="datetime-local" value={newStartAt} onChange={(e) => setNewStartAt(e.target.value)} data-testid="input-resched-start" />
            </div>
            <div>
              <Label>New End</Label>
              <Input type="datetime-local" value={newEndAt} onChange={(e) => setNewEndAt(e.target.value)} data-testid="input-resched-end" />
            </div>
          </div>
          <div>
            <Label>Instructor (leave blank to keep current)</Label>
            <Select value={newInstructorId || "__keep__"} onValueChange={(v) => setNewInstructorId(v === "__keep__" ? "" : v)}>
              <SelectTrigger data-testid="select-resched-instructor"><SelectValue placeholder="Keep current" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep__">Keep current instructor</SelectItem>
                {(instructors || []).map((m: any) => (
                  <SelectItem key={m.userId || m.id} value={m.userId || m.id}>
                    {m.firstName || m.email} {m.lastName || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Email Subject</Label>
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} data-testid="input-email-subject" />
          </div>
          <div>
            <Label>Email Body</Label>
            <Textarea rows={4} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Default body will be used if blank" data-testid="input-email-body" />
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Recipients ({recipients.length}):</span> {recipients.join(", ") || "None"}
          </div>
          {dateInvalid && (
            <p className="text-xs text-destructive" data-testid="text-resched-date-invalid">End time must be after start time.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-resched-cancel">Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!newStartAt || !newEndAt || dateInvalid || mutation.isPending}
            data-testid="button-resched-confirm"
          >
            {mutation.isPending ? "Rescheduling..." : "Reschedule & Notify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
