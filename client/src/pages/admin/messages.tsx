import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  MailOpen,
  Phone,
  Search,
  Archive,
  ArchiveRestore,
  Trash2,
  Inbox,
  CornerUpLeft,
  Send,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ContactSubmission, ContactMessageReply } from "@shared/schema";

type StatusFilter = "all" | "unread" | "read" | "archived";

type MessageRow = ContactSubmission & {
  lastReplyAt?: string | Date | null;
  replyCount?: number;
};

type EffectiveSender = {
  email: string;
  isDefault: boolean;
  source: "tenant" | "env" | "default";
};

type MessageDetail = MessageRow & {
  replies?: ContactMessageReply[];
  effectiveSender?: EffectiveSender;
};

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString();
}

export default function MessagesPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const tenantName = currentTenant?.tenant.name || "your school";
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ id: string }>("/admin/messages/:id");
  const routeId = params?.id ? parseInt(params.id, 10) : null;

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(routeId ?? null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");

  const queryKey = ["/api/tenants", tenantId, "contact-submissions", { status, search }] as const;

  const { data: listResponse, isLoading } = useQuery<{ items: MessageRow[]; page: number; pageSize: number }>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(
        `/api/tenants/${tenantId}/contact-submissions?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!tenantId,
  });
  const messages = listResponse?.items ?? [];

  // Fetch the currently-open message individually so URLs like /admin/messages/123
  // resolve even when filters/search would normally hide it, and so we always
  // get the latest reply thread regardless of list-cache freshness.
  const { data: detailMessage } = useQuery<MessageDetail>({
    queryKey: ["/api/tenants", tenantId, "contact-submissions", selectedId],
    queryFn: async () => {
      const res = await fetch(
        `/api/tenants/${tenantId}/contact-submissions/${selectedId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!tenantId && !!selectedId,
  });

  useEffect(() => {
    if (routeId !== null) setSelectedId(routeId);
  }, [routeId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "contact-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "contact-submissions", "unread-count"] });
  };

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: number; read?: boolean; archived?: boolean }) => {
      const { id, ...body } = vars;
      return apiRequest("PATCH", `/api/tenants/${tenantId}/contact-submissions/${id}`, body);
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ title: "Failed to update message", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/tenants/${tenantId}/contact-submissions/${id}`);
    },
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      setConfirmDeleteId(null);
      toast({ title: "Message deleted" });
    },
    onError: () => toast({ title: "Failed to delete message", variant: "destructive" }),
  });

  const replyMutation = useMutation({
    mutationFn: async (vars: { id: number; subject: string; body: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/tenants/${tenantId}/contact-submissions/${vars.id}/replies`,
        { subject: vars.subject, body: vars.body },
      );
      return res.json();
    },
    onSuccess: (data: { emailStatus?: string }) => {
      invalidate();
      setReplyBody("");
      const status = data?.emailStatus;
      if (status === "sent") {
        toast({ title: "Reply sent" });
      } else if (status === "skipped_no_provider") {
        toast({
          title: "Reply saved",
          description: "Email provider isn't configured, so the reply was logged but not delivered.",
        });
      } else if (status === "skipped_unsubscribed") {
        toast({
          title: "Reply saved",
          description: "The recipient is on your unsubscribe list, so no email was sent.",
          variant: "destructive",
        });
      } else if (status === "failed") {
        toast({
          title: "Reply saved but email failed",
          description: "The reply was logged but couldn't be delivered. Check your email provider.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Reply saved" });
      }
    },
    onError: () => toast({ title: "Failed to send reply", variant: "destructive" }),
  });

  const selectedFromList = messages.find((m) => m.id === selectedId) ?? null;
  const selected: MessageDetail | null =
    detailMessage && detailMessage.id === selectedId
      ? detailMessage
      : selectedFromList;
  const replies = detailMessage?.replies ?? [];

  // Reset / pre-fill the composer whenever a different message is opened.
  // Depends on `selected` so deep-linked messages whose detail loads
  // asynchronously also get the default subject prefilled on first render.
  useEffect(() => {
    if (selected) {
      setReplySubject(`Re: your message to ${tenantName}`);
      setReplyBody("");
    }
  }, [selectedId, tenantName, selected]);

  const handleOpen = (m: MessageRow) => {
    setSelectedId(m.id);
    setLocation(`/admin/messages/${m.id}`);
    if (!m.read) {
      updateMutation.mutate({ id: m.id, read: true });
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    if (routeId !== null) setLocation("/admin/messages");
  };

  const handleSendReply = () => {
    if (!selected) return;
    if (!replySubject.trim() || !replyBody.trim()) {
      toast({ title: "Subject and message are required", variant: "destructive" });
      return;
    }
    replyMutation.mutate({ id: selected.id, subject: replySubject, body: replyBody });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto" data-testid="page-messages">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-messages-title">
          <Inbox className="h-6 w-6" />
          Contact Messages
        </h1>
        <p className="text-sm text-muted-foreground">
          Messages submitted through your storefront contact form. Reply directly here and we'll send it from your school's email.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)} data-testid="tabs-status">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="unread" data-testid="tab-unread">Unread</TabsTrigger>
            <TabsTrigger value="read" data-testid="tab-read">Read</TabsTrigger>
            <TabsTrigger value="archived" data-testid="tab-archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, message…"
            className="pl-8"
            data-testid="input-search"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground" data-testid="text-empty">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No messages here yet</p>
            <p className="text-sm mt-1">When visitors submit your contact form, you'll see them here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => {
            const isArchived = !!m.archivedAt;
            const hasReply = (m.replyCount ?? 0) > 0;
            return (
              <Card
                key={m.id}
                className={`hover-elevate cursor-pointer transition ${!m.read && !isArchived ? "border-primary/40 bg-primary/[0.02]" : ""}`}
                onClick={() => handleOpen(m)}
                data-testid={`row-message-${m.id}`}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="mt-0.5">
                    {m.read ? (
                      <MailOpen className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Mail className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium truncate ${!m.read && !isArchived ? "" : "text-foreground"}`} data-testid={`text-name-${m.id}`}>
                        {m.name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{m.email}</span>
                      {!m.read && !isArchived && (
                        <Badge variant="default" className="text-[10px] py-0 h-4" data-testid={`badge-new-${m.id}`}>New</Badge>
                      )}
                      {hasReply && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 h-4 flex items-center gap-1"
                          data-testid={`badge-replied-${m.id}`}
                          title={m.lastReplyAt ? `Last reply ${formatDate(m.lastReplyAt)}` : undefined}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Replied{m.lastReplyAt ? ` · ${formatDate(m.lastReplyAt)}` : ""}
                        </Badge>
                      )}
                      {isArchived && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4">Archived</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5" data-testid={`text-preview-${m.id}`}>
                      {m.message}
                    </p>
                    {m.phone && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1" data-testid={`text-phone-${m.id}`}>
                        <Phone className="h-3 w-3" />
                        {m.phone}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-date-${m.id}`}>
                    {formatDate(m.createdAt)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-message-detail">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle data-testid="text-detail-name">{selected.name}</DialogTitle>
                <DialogDescription>
                  {selected.email}
                  {" · "}Received {formatDate(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {selected.phone && (
                  <div>
                    <Button asChild variant="outline" size="sm" data-testid="button-call-phone">
                      <a href={`tel:${selected.phone}`}>
                        <Phone className="h-4 w-4 mr-1.5" />
                        {selected.phone}
                      </a>
                    </Button>
                  </div>
                )}
                <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap text-sm" data-testid="text-detail-message">
                  {selected.message}
                </div>

                {replies.length > 0 && (
                  <div className="space-y-2" data-testid="list-replies">
                    <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                      Replies ({replies.length})
                    </h3>
                    {replies.map((r) => {
                      const isInbound = !r.authorUserId;
                      return (
                        <div
                          key={r.id}
                          className={`rounded-md border p-3 text-sm ${isInbound ? "bg-primary/[0.04] border-primary/30" : "bg-background"}`}
                          data-testid={`reply-${r.id}`}
                        >
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 gap-2 flex-wrap">
                            <span data-testid={`reply-author-${r.id}`} className="flex items-center gap-1.5 min-w-0">
                              <CornerUpLeft className="h-3 w-3 inline" />
                              <span className="truncate">
                                {r.authorEmail || (isInbound ? "Sender" : "Admin")} → {r.toEmail}
                              </span>
                              {isInbound && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] py-0 h-4"
                                  data-testid={`badge-inbound-${r.id}`}
                                >
                                  From sender
                                </Badge>
                              )}
                            </span>
                            <span data-testid={`reply-date-${r.id}`}>{formatDate(r.createdAt)}</span>
                          </div>
                          <div className="font-medium text-sm mb-1">{r.subject}</div>
                          <div className="whitespace-pre-wrap" data-testid={`reply-body-${r.id}`}>{r.body}</div>
                          {r.emailStatus && r.emailStatus !== "sent" && r.emailStatus !== "received" && (
                            <div className="mt-1 text-xs text-amber-600" data-testid={`reply-status-${r.id}`}>
                              Email status: {r.emailStatus}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2 border-t pt-4" data-testid="reply-composer">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <CornerUpLeft className="h-4 w-4" />
                    Reply to {selected.email}
                  </h3>
                  <div className="space-y-1">
                    <Label htmlFor="reply-subject">Subject</Label>
                    <Input
                      id="reply-subject"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      data-testid="input-reply-subject"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reply-body">Message</Label>
                    <Textarea
                      id="reply-body"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Type your reply…"
                      rows={6}
                      data-testid="input-reply-body"
                    />
                    <p className="text-xs text-muted-foreground">
                      The original message will be quoted automatically at the bottom of the email.
                    </p>
                  </div>
                  {detailMessage?.effectiveSender && (
                    <div
                      className="text-xs text-muted-foreground"
                      data-testid="text-effective-sender"
                    >
                      From:{" "}
                      <span className="font-mono">
                        {detailMessage.effectiveSender.email}
                      </span>
                      {detailMessage.effectiveSender.isDefault && (
                        <span
                          className="ml-2 text-amber-600"
                          data-testid="warning-default-sender"
                        >
                          This is the generic Drivorata address. Verify a
                          school domain in Resend so replies appear to come
                          from your school.
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSendReply}
                      disabled={replyMutation.isPending || !replyBody.trim() || !replySubject.trim()}
                      data-testid="button-send-reply"
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      {replyMutation.isPending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Confirmation email to sender:{" "}
                  <span data-testid="text-confirmation-status">
                    {selected.confirmationEmailSentAt
                      ? `sent ${formatDate(selected.confirmationEmailSentAt)}`
                      : "not sent"}
                  </span>
                </div>
              </div>
              <DialogFooter className="flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateMutation.mutate({ id: selected.id, read: !selected.read })}
                  disabled={updateMutation.isPending}
                  data-testid="button-toggle-read"
                >
                  {selected.read ? "Mark as unread" : "Mark as read"}
                </Button>
                {selected.archivedAt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateMutation.mutate({ id: selected.id, archived: false })}
                    disabled={updateMutation.isPending}
                    data-testid="button-unarchive"
                  >
                    <ArchiveRestore className="h-4 w-4 mr-1.5" />
                    Restore
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateMutation.mutate({ id: selected.id, archived: true });
                      handleClose();
                    }}
                    disabled={updateMutation.isPending}
                    data-testid="button-archive"
                  >
                    <Archive className="h-4 w-4 mr-1.5" />
                    Archive
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDeleteId(selected.id)}
                  data-testid="button-delete"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-md" data-testid="dialog-confirm-delete">
          <DialogHeader>
            <DialogTitle>Delete this message?</DialogTitle>
            <DialogDescription>
              This permanently removes the message. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
