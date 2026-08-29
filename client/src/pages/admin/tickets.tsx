import { useState } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquarePlus,
  ChevronDown,
  ChevronUp,
  Bug,
  Lightbulb,
  Palette,
  FileEdit,
  MoreHorizontal,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Lock,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SupportTicket, TicketResponse } from "@shared/schema";

function getStatusColor(status: string) {
  switch (status) {
    case "open":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800";
    case "acknowledged":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    case "planned":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800";
    case "wip":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800";
    case "ready":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    case "resolved":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
    case "closed":
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800";
    case "cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    default:
      return "";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "open": return "Open";
    case "acknowledged": return "Acknowledged";
    case "planned": return "Planned";
    case "wip": return "In Progress";
    case "ready": return "Ready";
    case "resolved": return "Resolved";
    case "closed": return "Closed";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`no-default-hover-elevate no-default-active-elevate ${getStatusColor(status)}`}
      data-testid={`badge-status-${status}`}
    >
      {getStatusLabel(status)}
    </Badge>
  );
}

function getTypeIcon(type: string) {
  switch (type) {
    case "bug": return Bug;
    case "feature_request": return Lightbulb;
    case "design": return Palette;
    case "content": return FileEdit;
    default: return MoreHorizontal;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case "bug": return "Bug";
    case "feature_request": return "Feature Request";
    case "design": return "Design";
    case "content": return "Content";
    case "other": return "Other";
    default: return type;
  }
}

function TypeBadge({ type }: { type: string }) {
  const Icon = getTypeIcon(type);
  return (
    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate" data-testid={`badge-type-${type}`}>
      <Icon className="h-3 w-3 mr-1" />
      {getTypeLabel(type)}
    </Badge>
  );
}

function TicketExpandedContent({
  ticket,
  tenantId,
}: {
  ticket: SupportTicket;
  tenantId: number;
}) {
  const { toast } = useToast();
  const [actionComment, setActionComment] = useState("");
  const [standaloneComment, setStandaloneComment] = useState("");
  const { data: detail, isLoading } = useQuery<{
    ticket: SupportTicket;
    responses: TicketResponse[];
  }>({
    queryKey: ["/api/tenants", tenantId, "tickets", ticket.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/tenants/${tenantId}/tickets/${ticket.id}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load ticket detail");
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const body: { status: string; comment?: string } = { status: newStatus };
      if (actionComment.trim()) body.comment = actionComment.trim();
      await apiRequest(
        "PATCH",
        `/api/tenants/${tenantId}/tickets/${ticket.id}/status`,
        body
      );
    },
    onSuccess: () => {
      setActionComment("");
      toast({ title: "Status updated successfully" });
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", tenantId, "tickets"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", tenantId, "tickets", ticket.id],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "POST",
        `/api/tenants/${tenantId}/tickets/${ticket.id}/responses`,
        { content: standaloneComment.trim() }
      );
    },
    onSuccess: () => {
      setStandaloneComment("");
      toast({ title: "Comment added" });
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", tenantId, "tickets"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", tenantId, "tickets", ticket.id],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3 pt-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-10" />
      </div>
    );
  }

  const responses = detail?.responses ?? [];
  const currentStatus = detail?.ticket?.status ?? ticket.status;

  return (
    <div className="space-y-4 pt-3 border-t">
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">Full Description</p>
        <p className="text-sm whitespace-pre-wrap" data-testid={`text-ticket-description-${ticket.id}`}>
          {ticket.description}
        </p>
      </div>

      {currentStatus === "ready" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">This ticket is marked as ready. What would you like to do?</p>
          <Textarea
            value={actionComment}
            onChange={(e) => setActionComment(e.target.value)}
            placeholder="Add a comment (optional)..."
            className="resize-none min-h-[80px]"
            data-testid={`input-action-comment-${ticket.id}`}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("resolved")}
              data-testid={`button-resolve-ticket-${ticket.id}`}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("open")}
              data-testid={`button-reopen-ticket-${ticket.id}`}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reopen
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("closed")}
              data-testid={`button-close-ticket-${ticket.id}`}
            >
              <Lock className="h-4 w-4 mr-1" />
              Close
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("cancelled")}
              data-testid={`button-cancel-ticket-${ticket.id}`}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {["open", "acknowledged", "planned", "wip"].includes(currentStatus) && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate("closed")}
            data-testid={`button-close-ticket-${ticket.id}`}
          >
            <Lock className="h-4 w-4 mr-1" />
            Close
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate("cancelled")}
            data-testid={`button-cancel-ticket-${ticket.id}`}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Add Comment</p>
        <Textarea
          value={standaloneComment}
          onChange={(e) => setStandaloneComment(e.target.value)}
          placeholder="Write a comment..."
          className="resize-none min-h-[80px]"
          data-testid={`input-standalone-comment-${ticket.id}`}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={commentMutation.isPending || !standaloneComment.trim()}
          onClick={() => commentMutation.mutate()}
          data-testid={`button-add-comment-${ticket.id}`}
        >
          <Send className="h-4 w-4 mr-1" />
          {commentMutation.isPending ? "Sending..." : "Add Comment"}
        </Button>
      </div>

      {responses.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Activity</p>
          {responses.map((r) => {
            const isOwnComment = r.authorUserId === ticket.submittedByUserId;
            return (
              <Card key={r.id} data-testid={`card-response-${r.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <span className="text-xs font-medium text-muted-foreground" data-testid={`text-response-author-${r.id}`}>
                      {isOwnComment ? "You" : "Support"}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid={`text-response-date-${r.id}`}>
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap" data-testid={`text-response-content-${r.id}`}>
                    {r.content}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const typeOptions = [
  { value: "all", label: "All Types" },
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature Request" },
  { value: "design", label: "Design" },
  { value: "content", label: "Content" },
  { value: "other", label: "Other" },
];

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "planned", label: "Planned" },
  { value: "wip", label: "In Progress" },
  { value: "ready", label: "Ready" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function TicketsPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/tenants", tenantId, "tickets"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/tickets`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const filteredTickets = tickets.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  if (!currentTenant) {
    return (
      <div className="p-6 text-muted-foreground">Select a school first.</div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-tickets-heading">
          My Feedback
        </h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-feedback-subtitle">
          Track the status of your submitted feedback
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" data-testid="feedback-filters">
        <div className="flex flex-wrap gap-1" data-testid="filter-type">
          {typeOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={typeFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(opt.value)}
              data-testid={`filter-type-${opt.value}`}
              className="text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="w-px bg-border mx-1 hidden sm:block" />
        <div className="flex flex-wrap gap-1" data-testid="filter-status">
          {statusOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(opt.value)}
              data-testid={`filter-status-${opt.value}`}
              className="text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filteredTickets.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <MessageSquarePlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p data-testid="text-no-tickets">
              {tickets.length === 0
                ? 'No feedback submitted yet. Use the "Share Feedback" button in the sidebar to get started.'
                : "No feedback matches the selected filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map((ticket) => {
            const isExpanded = expandedTicketId === ticket.id;
            const preview = ticket.description
              ? ticket.description.split("\n")[0].slice(0, 100)
              : "";
            return (
              <Card key={ticket.id} data-testid={`card-ticket-${ticket.id}`}>
                <div
                  className="p-4 cursor-pointer"
                  onClick={() =>
                    setExpandedTicketId(isExpanded ? null : ticket.id)
                  }
                  data-testid={`button-expand-ticket-${ticket.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm mb-2 text-muted-foreground line-clamp-1"
                        data-testid={`text-ticket-preview-${ticket.id}`}
                      >
                        {preview}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <TypeBadge type={ticket.type} />
                        <StatusBadge status={ticket.status} />
                        <span
                          className="text-xs text-muted-foreground"
                          data-testid={`text-ticket-date-${ticket.id}`}
                        >
                          {ticket.createdAt
                            ? new Date(ticket.createdAt).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                }
                              )
                            : ""}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      data-testid={`button-toggle-ticket-${ticket.id}`}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <TicketExpandedContent ticket={ticket} tenantId={tenantId!} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
