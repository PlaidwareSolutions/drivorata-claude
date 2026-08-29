import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Target,
  Users,
  Loader2,
  Send,
  Rocket,
  Clock,
  MessageSquare,
  ArrowRightLeft,
  ExternalLink,
  KeyRound,
  Copy,
  Check,
  Wand2,
  Layout,
  CheckCircle2,
  Link2,
} from "lucide-react";
import type { Lead, LeadNote } from "@shared/schema";
import { websiteTemplates } from "@shared/website-templates";

type LeadDetailResponse = {
  lead: Lead;
  notes: (LeadNote & { authorFirstName: string | null; authorLastName: string | null; authorEmail: string | null })[];
  convertedTenant: { id: number; name: string; slug: string } | null;
};

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  contacted: { label: "Contacted", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  qualified: { label: "Qualified", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  converted: { label: "Converted", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  lost: { label: "Lost", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

const noteTypeIcons: Record<string, typeof MessageSquare> = {
  note: MessageSquare,
  status_change: ArrowRightLeft,
  conversion: Rocket,
};

export default function LeadDetailPage() {
  const [, params] = useRoute("/platform/leads/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [noteContent, setNoteContent] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generateWebsiteOpen, setGenerateWebsiteOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [autoGenerateWebsite, setAutoGenerateWebsite] = useState(true);
  const [convertTemplateId, setConvertTemplateId] = useState<string | null>(null);
  const [enablePreview, setEnablePreview] = useState(true);
  const leadId = params?.id;

  const { data, isLoading } = useQuery<LeadDetailResponse>({
    queryKey: ["/api/platform/leads", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/platform/leads/${leadId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch lead");
      return res.json();
    },
    enabled: !!leadId,
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/platform/leads/${leadId}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/leads"] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/platform/leads/${leadId}/notes`, { content: noteContent });
      return res.json();
    },
    onSuccess: () => {
      setNoteContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/platform/leads", leadId] });
      toast({ title: "Note added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: async ({ generateWebsite, templateId, enablePreview }: { generateWebsite: boolean; templateId: string | null; enablePreview: boolean }) => {
      const res = await apiRequest("POST", `/api/platform/leads/${leadId}/convert`, {
        generateWebsite,
        templateId,
        enablePreview,
        referralCode: data?.lead?.referralCode || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/leads"] });
      const baseMsg = data.isNewUser && data.tempPassword
        ? `${data.message}. Temporary password: ${data.tempPassword} — please share this with the school admin securely.`
        : `${data.message}. The user already had an account and has been added as school admin.`;
      const websiteMsg = data.websiteGenerated ? ` Website generated with ${data.pagesCreated} pages.` : "";
      toast({
        title: "Lead Converted!",
        description: baseMsg + websiteMsg,
        duration: data.isNewUser && data.tempPassword ? 30000 : 5000,
      });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateWebsiteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const tenantId = data?.convertedTenant?.id;
      if (!tenantId) throw new Error("No tenant found");
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/pages/generate-from-template`, { templateId });
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({ title: "Website Generated!", description: result.message });
      setGenerateWebsiteOpen(false);
      setSelectedTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/leads", leadId] });
    },
    onError: (err: Error) => toast({ title: "Failed to generate website", description: err.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/platform/reset-user-password", { email });
      return res.json();
    },
    onSuccess: (data: any) => {
      const link = `${window.location.origin}/reset-password?token=${data.resetToken}`;
      setResetLink(link);
      setCopied(false);
      toast({ title: "Reset link generated", description: "Copy the link below and share it with the school admin." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCopyResetLink = async () => {
    if (resetLink) {
      try {
        await navigator.clipboard.writeText(resetLink);
        setCopied(true);
        toast({ title: "Copied!", description: "Reset link copied to clipboard." });
        setTimeout(() => setCopied(false), 3000);
      } catch {
        toast({ title: "Copy failed", description: "Please select and copy the link manually.", variant: "destructive" });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Lead not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/platform/leads")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Leads
        </Button>
      </div>
    );
  }

  const { lead, notes, convertedTenant } = data;
  const statusInfo = statusConfig[lead.status] || statusConfig.new;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/platform/leads")} data-testid="button-back-to-leads">
          <ArrowLeft className="h-4 w-4 mr-1" /> Leads
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-lead-name">{lead.name}</h1>
          <p className="text-sm text-muted-foreground">{lead.schoolName}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`${statusInfo.color} text-sm px-3 py-1`} data-testid="badge-lead-status">
            {statusInfo.label}
          </Badge>
          {lead.status !== "converted" && (
            <Select
              value={lead.status}
              onValueChange={(val) => statusMutation.mutate(val)}
              disabled={statusMutation.isPending}
            >
              <SelectTrigger className="w-[160px]" data-testid="select-lead-status">
                <SelectValue placeholder="Change status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${lead.email}`} className="text-primary hover:underline truncate" data-testid="text-lead-email">{lead.email}</a>
              </div>
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${lead.phone}`} className="text-foreground hover:underline" data-testid="text-lead-phone">{lead.phone}</a>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-foreground" data-testid="text-lead-school">{lead.schoolName}</span>
              </div>
              {lead.city && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{lead.city}</span>
                </div>
              )}
              {lead.locationsRange && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{lead.locationsRange} location(s)</span>
                </div>
              )}
              {lead.primaryNeed && (
                <div className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{lead.primaryNeed}</span>
                </div>
              )}
              {lead.referralCode && (
                <div className="flex items-center gap-2 text-sm">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">Referral: </span>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-lead-referral">{lead.referralCode}</Badge>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  Submitted {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {convertedTenant ? (
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Rocket className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-semibold text-sm text-foreground">Converted to Tenant</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{convertedTenant.name}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/admin`)}
                    data-testid="button-view-tenant"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> View School
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGenerateWebsiteOpen(true)}
                    data-testid="button-generate-website"
                  >
                    <Wand2 className="h-3 w-3 mr-1" /> Generate Website
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetPasswordMutation.mutate(lead.email)}
                    disabled={resetPasswordMutation.isPending}
                    data-testid="button-reset-password"
                  >
                    {resetPasswordMutation.isPending ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Resetting...</>
                    ) : (
                      <><KeyRound className="h-3 w-3 mr-1" /> Reset Password</>
                    )}
                  </Button>
                </div>
                {resetLink && (
                  <div className="mt-3 p-2 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Password reset link (expires in 24 hours):</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-background px-2 py-1 rounded border flex-1 truncate" data-testid="text-reset-link">{resetLink}</code>
                      <Button variant="ghost" size="icon" onClick={handleCopyResetLink} data-testid="button-copy-reset-link" className="shrink-0 h-7 w-7">
                        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : lead.status !== "lost" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full" size="lg" disabled={convertMutation.isPending} data-testid="button-convert-lead">
                  {convertMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Converting...</>
                  ) : (
                    <><Rocket className="h-4 w-4 mr-2" /> Convert to Tenant</>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>Convert Lead to Tenant?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a new driving school called "{lead.schoolName}" with {lead.email} as the admin account.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3">
                    <div>
                      <Label htmlFor="enable-preview" className="text-sm font-medium cursor-pointer">
                        Start with Demo Data (Preview Mode)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Fills the school with realistic sessions, enrollments, and members so they can explore all features before going live.
                      </p>
                    </div>
                    <Switch
                      id="enable-preview"
                      checked={enablePreview}
                      onCheckedChange={setEnablePreview}
                      data-testid="switch-enable-preview"
                    />
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="auto-generate"
                      checked={autoGenerateWebsite}
                      onCheckedChange={(checked) => {
                        setAutoGenerateWebsite(!!checked);
                        if (!checked) setConvertTemplateId(null);
                      }}
                      data-testid="checkbox-auto-generate"
                    />
                    <div>
                      <Label htmlFor="auto-generate" className="text-sm font-medium cursor-pointer">
                        Auto-generate website pages
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Creates Home, About, Packages, Contact & FAQ pages with a professional template
                      </p>
                    </div>
                  </div>
                  {autoGenerateWebsite && (
                    <div className="ml-7 grid grid-cols-2 gap-2">
                      {websiteTemplates.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => setConvertTemplateId(t.id === convertTemplateId ? null : t.id)}
                          className={`cursor-pointer rounded-md border p-2 text-xs transition-all hover:shadow-sm ${convertTemplateId === t.id ? "ring-2 ring-primary border-primary" : ""}`}
                          data-testid={`convert-template-${t.id}`}
                        >
                          <div className="flex gap-1 mb-1">
                            <div className="h-4 w-4 rounded-sm" style={{ backgroundColor: t.previewColors.primary }} />
                            <div className="h-4 w-4 rounded-sm" style={{ backgroundColor: t.previewColors.accent }} />
                          </div>
                          <p className="font-medium">{t.name}</p>
                        </div>
                      ))}
                      {!convertTemplateId && (
                        <p className="col-span-2 text-[10px] text-muted-foreground italic">
                          No template selected — a random one will be used
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-convert">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => convertMutation.mutate({
                      generateWebsite: autoGenerateWebsite,
                      templateId: convertTemplateId,
                      enablePreview,
                    })}
                    data-testid="button-confirm-convert"
                  >
                    Convert to Tenant
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}

          {convertedTenant && (
            <Dialog open={generateWebsiteOpen} onOpenChange={setGenerateWebsiteOpen}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Layout className="h-5 w-5" />
                    Generate Website for {convertedTenant.name}
                  </DialogTitle>
                  <DialogDescription>
                    Choose a template to generate a complete multi-page website. Each template creates 5 pages with your school's info pre-filled.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 py-2">
                  {websiteTemplates.map((t) => (
                    <Card
                      key={t.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${selectedTemplateId === t.id ? "ring-2 ring-primary" : ""}`}
                      onClick={() => setSelectedTemplateId(t.id)}
                      data-testid={`generate-template-${t.id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex gap-1.5 mb-2">
                          <div className="h-6 w-6 rounded" style={{ backgroundColor: t.previewColors.primary }} />
                          <div className="h-6 w-6 rounded" style={{ backgroundColor: t.previewColors.accent }} />
                          <div className="h-6 w-6 rounded border" style={{ backgroundColor: t.previewColors.bg }} />
                        </div>
                        <h4 className="font-semibold text-sm">{t.name}</h4>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                        {selectedTemplateId === t.id && (
                          <div className="mt-2 flex items-center gap-1 text-primary text-xs font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Selected
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {selectedTemplateId && (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setGenerateWebsiteOpen(false); setSelectedTemplateId(null); }}>Cancel</Button>
                    <Button
                      onClick={() => generateWebsiteMutation.mutate(selectedTemplateId)}
                      disabled={generateWebsiteMutation.isPending}
                      data-testid="button-confirm-generate-website"
                    >
                      {generateWebsiteMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
                      ) : (
                        <><Wand2 className="h-4 w-4 mr-1" /> Generate Website</>
                      )}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add a Note</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Textarea
                  placeholder="Add a note about this lead..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={3}
                  data-testid="textarea-add-note"
                />
                <Button
                  onClick={() => noteMutation.mutate()}
                  disabled={!noteContent.trim() || noteMutation.isPending}
                  data-testid="button-add-note"
                >
                  {noteMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Add Note</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity yet</p>
              ) : (
                <div className="space-y-0">
                  {notes.map((note, idx) => {
                    const NoteIcon = noteTypeIcons[note.type] || MessageSquare;
                    const isLast = idx === notes.length - 1;
                    return (
                      <div key={note.id} className="flex gap-3" data-testid={`note-${note.id}`}>
                        <div className="flex flex-col items-center">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                            note.type === "conversion" ? "bg-green-100 dark:bg-green-900/30" :
                            note.type === "status_change" ? "bg-yellow-100 dark:bg-yellow-900/30" :
                            "bg-muted"
                          }`}>
                            <NoteIcon className={`h-4 w-4 ${
                              note.type === "conversion" ? "text-green-600 dark:text-green-400" :
                              note.type === "status_change" ? "text-yellow-600 dark:text-yellow-400" :
                              "text-muted-foreground"
                            }`} />
                          </div>
                          {!isLast && <div className="w-px flex-1 bg-border min-h-[16px]" />}
                        </div>
                        <div className={`pb-4 flex-1 ${isLast ? "" : ""}`}>
                          <p className="text-sm text-foreground">{note.content}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {note.authorFirstName || note.authorEmail || "System"}
                              {note.authorLastName ? ` ${note.authorLastName}` : ""}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {note.createdAt ? new Date(note.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
