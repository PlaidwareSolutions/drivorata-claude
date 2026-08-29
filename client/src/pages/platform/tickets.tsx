import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Loader2,
  MessageSquare,
  AlertCircle,
  Eye,
  Clock,
  CheckCircle2,
  CircleDot,
  XCircle,
  ArrowLeft,
  Send,
  Lock,
  Building2,
  CalendarClock,
  Hammer,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SupportTicket, TicketResponse } from "@shared/schema";

type TicketWithMeta = SupportTicket & {
  tenantName: string;
  submitterName: string;
  submitterEmail: string;
};

type TicketDetail = TicketWithMeta & {
  responses: (TicketResponse & { authorName: string; authorEmail: string })[];
};

type TicketStats = Record<string, number>;

const statusConfig: Record<string, { label: string; className: string; icon: typeof CircleDot }> = {
  open: { label: "Open", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: AlertCircle },
  acknowledged: { label: "Acknowledged", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Eye },
  planned: { label: "Planned", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300", icon: CalendarClock },
  wip: { label: "WIP", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", icon: Hammer },
  ready: { label: "Ready", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle2 },
  resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: ShieldCheck },
  closed: { label: "Closed", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300", icon: XCircle },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: Ban },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  bug: { label: "Bug", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  feature_request: { label: "Feature Request", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  design: { label: "Design", className: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300" },
  content: { label: "Content", className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
  other: { label: "Other", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  medium: { label: "Medium", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  high: { label: "High", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const statusTabs = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "planned", label: "Planned" },
  { value: "wip", label: "WIP" },
  { value: "ready", label: "Ready" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

const typeTabs = [
  { value: "all", label: "All Types" },
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature Request" },
  { value: "design", label: "Design" },
  { value: "content", label: "Content" },
  { value: "other", label: "Other" },
];

function getDisplaySubject(ticket: { subject: string; description: string }): string {
  if (!ticket.subject) {
    const desc = ticket.description || "No description";
    return desc.length > 50 ? desc.slice(0, 50) + "..." : desc;
  }
  return ticket.subject;
}

export default function PlatformTicketsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data: stats = { open: 0, acknowledged: 0, planned: 0, wip: 0, ready: 0, resolved: 0, closed: 0, cancelled: 0 } } = useQuery<TicketStats>({
    queryKey: ["/api/platform/tickets/stats"],
  });

  const { data: tickets = [], isLoading } = useQuery<TicketWithMeta[]>({
    queryKey: ["/api/platform/tickets", debouncedSearch, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/platform/tickets?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });

  const { data: ticketDetail, isLoading: detailLoading } = useQuery<TicketDetail>({
    queryKey: ["/api/platform/tickets", selectedTicketId],
    queryFn: async () => {
      const res = await fetch(`/api/platform/tickets/${selectedTicketId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ticket");
      return res.json();
    },
    enabled: !!selectedTicketId,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ ticketId, status, priority }: { ticketId: number; status?: string; priority?: string }) => {
      const body: Record<string, string> = {};
      if (status) body.status = status;
      if (priority) body.priority = priority;
      await apiRequest("PATCH", `/api/platform/tickets/${ticketId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tickets/stats"] });
      toast({ title: "Ticket updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId || !replyContent.trim()) return;
      await apiRequest("POST", `/api/platform/tickets/${selectedTicketId}/responses`, {
        content: replyContent.trim(),
        isInternal,
      });
    },
    onSuccess: () => {
      setReplyContent("");
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tickets", selectedTicketId] });
      toast({ title: isInternal ? "Internal note added" : "Reply sent" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSearch = () => setDebouncedSearch(search);
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSearch(); };

  const statCards = [
    { key: "open", label: "Open", icon: AlertCircle, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10" },
    { key: "acknowledged", label: "Acknowledged", icon: Eye, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
    { key: "planned", label: "Planned", icon: CalendarClock, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
    { key: "wip", label: "WIP", icon: Hammer, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
    { key: "ready", label: "Ready", icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10" },
    { key: "resolved", label: "Resolved", icon: ShieldCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-tickets-title">Support Tickets</h1>
        <p className="text-sm text-muted-foreground">Manage feedback and bug reports from schools</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Card key={s.key}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground" data-testid={`text-stat-${s.key}`}>{stats[s.key] || 0}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-1">
        {statusTabs.map((tab) => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter(tab.value)}
            data-testid={`tab-ticket-status-${tab.value}`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by subject, school, or submitter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeTabs.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSearch} data-testid="button-search-tickets">Search</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No tickets found</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Submitter</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => {
                const st = statusConfig[ticket.status] || statusConfig.open;
                const tp = typeConfig[ticket.type] || typeConfig.bug;
                const pr = ticket.priority ? priorityConfig[ticket.priority] : null;
                return (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    data-testid={`row-ticket-${ticket.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Link
                          href={`/platform/tenants/${ticket.tenantId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-primary hover:underline"
                          data-testid={`link-tenant-${ticket.id}`}
                        >
                          {ticket.tenantName}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{ticket.submitterName}</p>
                        <p className="text-xs text-muted-foreground">{ticket.submitterEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{getDisplaySubject(ticket)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={tp.className} data-testid={`badge-type-${ticket.id}`}>{tp.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={st.className} data-testid={`badge-status-${ticket.id}`}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {pr ? (
                        <Badge className={pr.className} data-testid={`badge-priority-${ticket.id}`}>{pr.label}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedTicketId} onOpenChange={(open) => { if (!open) setSelectedTicketId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : ticketDetail ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTicketId(null)} data-testid="button-back-tickets">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <DialogTitle className="text-lg">{getDisplaySubject(ticketDetail)}</DialogTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2 ml-10">
                  <Badge className={typeConfig[ticketDetail.type]?.className || ""}>
                    {typeConfig[ticketDetail.type]?.label || ticketDetail.type}
                  </Badge>
                  <Badge className={statusConfig[ticketDetail.status]?.className || ""}>
                    {statusConfig[ticketDetail.status]?.label || ticketDetail.status}
                  </Badge>
                  {ticketDetail.priority && (
                    <Badge className={priorityConfig[ticketDetail.priority]?.className || ""}>
                      {priorityConfig[ticketDetail.priority]?.label || ticketDetail.priority}
                    </Badge>
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {ticketDetail.tenantName}
                  </span>
                  <span>By {ticketDetail.submitterName} ({ticketDetail.submitterEmail})</span>
                  <span>{ticketDetail.createdAt ? new Date(ticketDetail.createdAt).toLocaleString() : ""}</span>
                </div>

                <div className="p-3 bg-muted/50 rounded-md text-sm whitespace-pre-wrap" data-testid="text-ticket-description">
                  {ticketDetail.description}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Status:</Label>
                    <Select
                      value={ticketDetail.status}
                      onValueChange={(val) => updateMutation.mutate({ ticketId: ticketDetail.id, status: val })}
                      disabled={updateMutation.isPending}
                    >
                      <SelectTrigger className="w-[150px]" data-testid="select-ticket-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="acknowledged">Acknowledged</SelectItem>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="wip">WIP</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Priority:</Label>
                    <Select
                      value={ticketDetail.priority ?? "none"}
                      onValueChange={(val) => updateMutation.mutate({ ticketId: ticketDetail.id, priority: val === "none" ? undefined : val })}
                      disabled={updateMutation.isPending}
                    >
                      <SelectTrigger className="w-[120px]" data-testid="select-ticket-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h3 className="text-sm font-semibold mb-3">Responses</h3>
                  {ticketDetail.responses && ticketDetail.responses.length > 0 ? (
                    <div className="space-y-3">
                      {ticketDetail.responses.map((resp) => (
                        <div
                          key={resp.id}
                          className={`p-3 rounded-md text-sm ${
                            resp.isInternal
                              ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
                              : "bg-muted/50"
                          }`}
                          data-testid={`response-${resp.id}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-xs">{resp.authorName}</span>
                            <span className="text-xs text-muted-foreground">{resp.authorEmail}</span>
                            {resp.isInternal && (
                              <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                                <Lock className="h-2.5 w-2.5" /> Internal
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {resp.createdAt ? new Date(resp.createdAt).toLocaleString() : ""}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap">{resp.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No responses yet</p>
                  )}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <Textarea
                    placeholder={isInternal ? "Write an internal note..." : "Write a reply..."}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    className="resize-none"
                    rows={3}
                    data-testid="textarea-ticket-reply"
                  />
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="internal-note"
                        checked={isInternal}
                        onCheckedChange={setIsInternal}
                        data-testid="switch-internal-note"
                      />
                      <Label htmlFor="internal-note" className="text-xs cursor-pointer flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Internal note
                      </Label>
                    </div>
                    <Button
                      onClick={() => replyMutation.mutate()}
                      disabled={!replyContent.trim() || replyMutation.isPending}
                      data-testid="button-send-reply"
                    >
                      {replyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      {isInternal ? "Add Note" : "Send Reply"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-6">Ticket not found</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
