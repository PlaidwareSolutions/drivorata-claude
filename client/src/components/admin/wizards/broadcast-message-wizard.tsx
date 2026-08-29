import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { WizardShell, type WizardStep } from "./wizard-shell";

interface LocationItem { id: number; name: string }
interface OfferingItem { id: number; name: string; status: string }
interface PreviewResponse {
  recipientCount: number;
  emailCount: number;
  inAppCount: number;
  sampleNames?: string[];
}
interface SendResponse {
  recipients: number;
  email: { sent: number; skippedUnsubscribed: number; skippedNoProvider: number; failed: number; noEmail: number };
  notifications: number;
}

const STEPS: WizardStep[] = [
  { key: "audience", title: "Audience" },
  { key: "compose", title: "Compose" },
  { key: "review", title: "Review & Send" },
];

type Audience =
  | "ALL_MEMBERS"
  | "ALL_ACTIVE_STUDENTS"
  | "ROLE_STUDENT"
  | "ROLE_PARENT"
  | "ROLE_INSTRUCTOR"
  | "ROLE_OFFICE_MANAGER"
  | "ROLE_TENANT_ADMIN"
  | "ROSTER_OF_OFFERING"
  | "STALE_CREDIT_STUDENTS"
  | "CUSTOM_EMAIL_LIST";

const AUDIENCE_LABELS: Record<Audience, string> = {
  ALL_MEMBERS: "Everyone (all active members)",
  ALL_ACTIVE_STUDENTS: "Students with confirmed/active enrollments",
  ROLE_STUDENT: "All students",
  ROLE_PARENT: "All parents",
  ROLE_INSTRUCTOR: "All instructors",
  ROLE_OFFICE_MANAGER: "All office managers",
  ROLE_TENANT_ADMIN: "All admins",
  ROSTER_OF_OFFERING: "Students enrolled in a specific cohort",
  STALE_CREDIT_STUDENTS: "Students with stale unused credits",
  CUSTOM_EMAIL_LIST: "Custom email list (paste in)",
};

interface Props {
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// We intentionally render the broadcast preview as plain text (no HTML / no
// dangerouslySetInnerHTML). Email recipients receive plain text body; in-app
// notifications likewise render as text. Showing the same plain text in the
// preview avoids any XSS surface from arbitrary admin-typed content.

export function BroadcastMessageWizard({ tenantId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [stepIdx, setStepIdx] = useState(0);

  const [audience, setAudience] = useState<Audience>("ALL_ACTIVE_STUDENTS");
  const [locationIds, setLocationIds] = useState<number[]>([]);
  const [offeringId, setOfferingId] = useState<number | null>(null);
  const [staleDays, setStaleDays] = useState<number>(30);
  const [customEmailsText, setCustomEmailsText] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [composeView, setComposeView] = useState<"edit" | "preview">("edit");

  const { data: locations = [] } = useQuery<LocationItem[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: offerings = [] } = useQuery<OfferingItem[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/schedule-offerings`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId && audience === "ROSTER_OF_OFFERING",
  });

  const customEmails = useMemo(() => {
    return customEmailsText
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => /\S+@\S+\.\S+/.test(e));
  }, [customEmailsText]);

  const previewBody = useMemo(() => ({
    audience,
    locationIds: locationIds.length > 0 ? locationIds : undefined,
    offeringId: audience === "ROSTER_OF_OFFERING" ? offeringId ?? undefined : undefined,
    customEmails: audience === "CUSTOM_EMAIL_LIST" ? customEmails : undefined,
    staleDays: audience === "STALE_CREDIT_STUDENTS" ? staleDays : undefined,
  }), [audience, locationIds, offeringId, customEmails, staleDays]);

  const previewKey = JSON.stringify(previewBody);

  const { data: preview, isLoading: isPreviewLoading } = useQuery<PreviewResponse>({
    queryKey: ["/api/tenants", tenantId, "broadcasts", "preview", previewKey],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/broadcasts/preview`, previewBody);
      return res.json();
    },
    enabled: open && stepIdx === 2,
  });

  function reset() {
    setStepIdx(0);
    setAudience("ALL_ACTIVE_STUDENTS");
    setLocationIds([]);
    setOfferingId(null);
    setStaleDays(30);
    setCustomEmailsText("");
    setEmailEnabled(true);
    setInAppEnabled(true);
    setSubject("");
    setBody("");
    setComposeView("edit");
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/broadcasts`, {
        ...previewBody,
        channels: { email: emailEnabled, inApp: inAppEnabled },
        subject,
        body,
      });
      return res.json() as Promise<SendResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Broadcast sent",
        description: `Reached ${data.recipients} recipients (${data.email.sent} emails, ${data.notifications} notifications).`,
      });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send broadcast",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function toggleLocation(id: number) {
    setLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const audienceConfigured =
    audience !== "ROSTER_OF_OFFERING" || offeringId !== null;
  const audienceHasInputs =
    audience !== "CUSTOM_EMAIL_LIST" || customEmails.length > 0;

  const stepValid: Record<number, boolean> = {
    0: !!audience && (emailEnabled || inAppEnabled) && audienceConfigured && audienceHasInputs,
    1: subject.trim().length > 0 && body.trim().length > 0,
    2: !!preview && preview.recipientCount > 0,
  };

  const isDirty =
    subject.length > 0 ||
    body.length > 0 ||
    locationIds.length > 0 ||
    offeringId !== null ||
    customEmailsText.length > 0 ||
    audience !== "ALL_ACTIVE_STUDENTS";

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  const memberAudienceWithLocations =
    audience === "ALL_MEMBERS" ||
    audience === "ALL_ACTIVE_STUDENTS" ||
    audience === "STALE_CREDIT_STUDENTS" ||
    audience.startsWith("ROLE_");

  return (
    <WizardShell
      open={open}
      onOpenChange={handleClose}
      title="Send Broadcast Message"
      description="Send an announcement via email and/or in-app notification to a group of users."
      steps={STEPS}
      currentStepIndex={stepIdx}
      onBack={() => setStepIdx((i) => Math.max(0, i - 1))}
      onNext={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
      onSubmit={() => sendMutation.mutate()}
      canGoBack={stepIdx > 0}
      canGoNext={stepValid[stepIdx]}
      isSubmitting={sendMutation.isPending}
      submitLabel="Send Broadcast"
      testIdPrefix="broadcast"
      isDirty={isDirty}
    >
      {stepIdx === 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Audience *</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger data-testid="select-broadcast-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                  <SelectItem key={a} value={a} data-testid={`option-broadcast-audience-${a}`}>
                    {AUDIENCE_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {audience === "ROSTER_OF_OFFERING" && (
            <div className="space-y-1">
              <Label>Cohort *</Label>
              <Select
                value={offeringId ? String(offeringId) : ""}
                onValueChange={(v) => setOfferingId(parseInt(v, 10))}
              >
                <SelectTrigger data-testid="select-broadcast-offering">
                  <SelectValue placeholder="Pick a cohort..." />
                </SelectTrigger>
                <SelectContent>
                  {offerings.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)} data-testid={`option-broadcast-offering-${o.id}`}>
                      {o.name} <span className="ml-2 text-[10px] text-muted-foreground">({o.status})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Includes both students and parent contacts on file.</p>
            </div>
          )}

          {audience === "STALE_CREDIT_STUDENTS" && (
            <div className="space-y-1">
              <Label htmlFor="bc-stale-days">No activity in the last (days) *</Label>
              <Input
                id="bc-stale-days"
                type="number"
                min={1}
                max={365}
                value={staleDays}
                onChange={(e) => setStaleDays(parseInt(e.target.value || "30", 10))}
                data-testid="input-broadcast-stale-days"
              />
              <p className="text-xs text-muted-foreground">
                Targets active students with unused drive credits and no recent enrollment updates.
              </p>
            </div>
          )}

          {audience === "CUSTOM_EMAIL_LIST" && (
            <div className="space-y-1">
              <Label htmlFor="bc-custom-emails">Email addresses *</Label>
              <Textarea
                id="bc-custom-emails"
                value={customEmailsText}
                onChange={(e) => setCustomEmailsText(e.target.value)}
                placeholder="alice@example.com, bob@example.com&#10;or one per line"
                rows={5}
                data-testid="textarea-broadcast-custom-emails"
              />
              <p className="text-xs text-muted-foreground">
                {customEmails.length} valid email{customEmails.length === 1 ? "" : "s"} parsed.
              </p>
            </div>
          )}

          {memberAudienceWithLocations && locations.length > 1 && (
            <div className="space-y-1">
              <Label>Limit to locations (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Leave all unchecked to include members from any location.
              </p>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {locations.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={locationIds.includes(l.id)}
                      onCheckedChange={() => toggleLocation(l.id)}
                      data-testid={`checkbox-broadcast-location-${l.id}`}
                    />
                    <span>{l.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1 border-t pt-3">
            <Label>Channels *</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={emailEnabled} onCheckedChange={(c) => setEmailEnabled(!!c)} data-testid="checkbox-broadcast-email" />
                <span className="text-sm">Email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={inAppEnabled} onCheckedChange={(c) => setInAppEnabled(!!c)} data-testid="checkbox-broadcast-inapp" />
                <span className="text-sm">In-app notification</span>
              </label>
            </div>
            {!emailEnabled && !inAppEnabled && (
              <p className="text-xs text-destructive">Pick at least one channel.</p>
            )}
          </div>
        </div>
      )}

      {stepIdx === 1 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bc-subject">Subject *</Label>
            <Input
              id="bc-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
              data-testid="input-broadcast-subject"
            />
            <p className="text-xs text-muted-foreground">{subject.length}/150</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bc-body">Message *</Label>
            <Tabs value={composeView} onValueChange={(v) => setComposeView(v as "edit" | "preview")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="edit" data-testid="tab-broadcast-edit">Edit</TabsTrigger>
                <TabsTrigger value="preview" data-testid="tab-broadcast-preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="mt-2">
                <Textarea
                  id="bc-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  maxLength={5000}
                  data-testid="textarea-broadcast-body"
                  placeholder={"Type your message. Recipients see it as plain text in email and in-app notifications."}
                />
                <p className="text-xs text-muted-foreground mt-1">{body.length}/5000</p>
              </TabsContent>
              <TabsContent value="preview" className="mt-2">
                <div
                  className="border rounded-md p-3 min-h-[200px] text-sm whitespace-pre-wrap break-words"
                  data-testid="text-broadcast-body-preview"
                >
                  {body || <span className="text-muted-foreground italic">Nothing to preview yet.</span>}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {stepIdx === 2 && (
        <div className="space-y-3 text-sm">
          <Card>
            <CardContent className="pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Recipients</span>
                {isPreviewLoading ? (
                  <span className="text-muted-foreground">Loading…</span>
                ) : (
                  <Badge data-testid="badge-broadcast-recipient-count">
                    {preview?.recipientCount ?? 0} people
                  </Badge>
                )}
              </div>
              {preview && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {emailEnabled && <p>{preview.emailCount} will receive email (subject to suppression list)</p>}
                  {inAppEnabled && <p>{preview.inAppCount} will receive in-app notification</p>}
                </div>
              )}
              {preview?.sampleNames && preview.sampleNames.length > 0 && (
                <div className="text-xs text-muted-foreground" data-testid="text-broadcast-sample-names">
                  <span className="font-medium">Sample:</span> {preview.sampleNames.join(", ")}
                  {preview.recipientCount > preview.sampleNames.length && <> …and {preview.recipientCount - preview.sampleNames.length} more</>}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Audience: {AUDIENCE_LABELS[audience]}
                {locationIds.length > 0 && (
                  <> · Locations: {locationIds.map((id) => locations.find((l) => l.id === id)?.name).filter(Boolean).join(", ")}</>
                )}
                {audience === "ROSTER_OF_OFFERING" && offeringId && (
                  <> · Cohort: {offerings.find((o) => o.id === offeringId)?.name ?? "—"}</>
                )}
                {audience === "STALE_CREDIT_STUDENTS" && (
                  <> · Stale ≥ {staleDays} days</>
                )}
                {audience === "CUSTOM_EMAIL_LIST" && (
                  <> · {customEmails.length} provided</>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 space-y-1">
              <p className="font-medium">{subject}</p>
              <div className="text-muted-foreground whitespace-pre-wrap break-words text-sm">
                {body}
              </div>
            </CardContent>
          </Card>
          {preview && preview.recipientCount === 0 && (
            <p className="text-sm text-destructive">No recipients match this audience. Adjust filters or invite members.</p>
          )}
        </div>
      )}
    </WizardShell>
  );
}
