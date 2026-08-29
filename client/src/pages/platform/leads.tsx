import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Search, Users, Mail, Building2, Loader2, CheckCircle2, XCircle, Phone as PhoneIcon, Sparkles, MessageSquareMore } from "lucide-react";
import type { Lead } from "@shared/schema";

const statusTabs = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

const statusBadgeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  new: { label: "New", variant: "default", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100" },
  contacted: { label: "Contacted", variant: "default", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 hover:bg-yellow-100" },
  qualified: { label: "Qualified", variant: "default", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-100" },
  converted: { label: "Converted", variant: "default", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100" },
  lost: { label: "Lost", variant: "default", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100" },
};

export default function PlatformLeadsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: allLeads = [] } = useQuery<Lead[]>({
    queryKey: ["/api/platform/leads", "", "all"],
    queryFn: async () => {
      const res = await fetch(`/api/platform/leads`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/platform/leads", debouncedSearch, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/platform/leads?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });

  const handleSearch = () => setDebouncedSearch(search);
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSearch(); };

  const exportCSV = () => {
    if (!leads.length) return;
    const headers = ["Name", "Email", "Phone", "School Name", "City", "Locations", "Primary Need", "Status", "Source", "Referral Code", "Date"];
    const rows = leads.map((l) => [
      l.name, l.email, l.phone || "", l.schoolName, l.city || "",
      l.locationsRange || "", l.primaryNeed || "", l.status || "new",
      l.source || "", l.referralCode || "", l.createdAt ? new Date(l.createdAt).toLocaleDateString() : "",
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const newCount = allLeads.filter(l => l.status === "new").length;
  const contactedCount = allLeads.filter(l => l.status === "contacted").length;
  const qualifiedCount = allLeads.filter(l => l.status === "qualified").length;
  const convertedCount = allLeads.filter(l => l.status === "converted").length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-leads-title">Leads</h1>
          <p className="text-sm text-muted-foreground">Manage and convert lead magnet submissions</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!leads.length} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{newCount}</p>
              <p className="text-xs text-muted-foreground">New</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
              <MessageSquareMore className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{contactedCount}</p>
              <p className="text-xs text-muted-foreground">Contacted</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{qualifiedCount}</p>
              <p className="text-xs text-muted-foreground">Qualified</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{convertedCount}</p>
              <p className="text-xs text-muted-foreground">Converted</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-1">
        {statusTabs.map((tab) => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter(tab.value)}
            data-testid={`tab-status-${tab.value}`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or school..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
            data-testid="input-search-leads"
          />
        </div>
        <Button onClick={handleSearch} data-testid="button-search-leads">Search</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No leads found</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>School</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="hidden md:table-cell">City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Need</TableHead>
                <TableHead className="hidden lg:table-cell">Referral</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const badge = statusBadgeConfig[lead.status] || statusBadgeConfig.new;
                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/platform/leads/${lead.id}`)}
                    data-testid={`row-lead-${lead.id}`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{lead.name}</p>
                        <p className="text-xs text-muted-foreground sm:hidden">{lead.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{lead.schoolName}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="space-y-0.5">
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {lead.email}
                        </p>
                        {lead.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <PhoneIcon className="h-3 w-3" /> {lead.phone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{lead.city || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={badge.className} data-testid={`badge-status-${lead.id}`}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lead.primaryNeed ? <Badge variant="outline" className="text-xs">{lead.primaryNeed}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lead.referralCode ? (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-referral-${lead.id}`}>
                          {lead.referralCode}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
