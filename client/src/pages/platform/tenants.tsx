import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Building2,
  MapPin,
  Users,
  GraduationCap,
  ExternalLink,
  Search,
  FlaskConical,
  CreditCard,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { usePlatform } from "@/lib/platform-context";
import { useState } from "react";
import { useLocation } from "wouter";

interface TenantWithStats {
  id: number;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  customDomain: string | null;
  domainVerified: boolean;
  logoUrl: string | null;
  locationCount: number;
  memberCount: number;
  enrollmentCount: number;
  previewMode?: boolean;
  websiteEnabled?: boolean;
  planId: number | null;
  subscriptionStatus: string | null;
  billingEmail: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  planName: string | null;
  monthlyPriceCents: number | null;
  maxLocations: number | null;
  maxStudents: number | null;
  maxInstructors: number | null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getStatusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "trialing": return "outline";
    case "past_due":
    case "suspended": return "destructive";
    case "canceled": return "secondary";
    default: return "outline";
  }
}

export default function PlatformTenants() {
  const { data: tenants, isLoading } = useQuery<TenantWithStats[]>({
    queryKey: ["/api/platform/tenants"],
  });
  const { enterTenant } = usePlatform();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const filteredTenants = (tenants || []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEnterSchool = (tenantId: number) => {
    enterTenant(tenantId);
    setLocation("/admin");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-platform-tenants-title">Tenants</h1>
          <p className="text-muted-foreground">{filteredTenants.length} driving school{filteredTenants.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search schools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-tenants"
        />
      </div>

      <div className="space-y-3">
        {filteredTenants.map((tenant) => (
          <Card key={tenant.id} data-testid={`card-tenant-${tenant.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-base truncate" data-testid={`text-tenant-name-${tenant.id}`}>
                      {tenant.name}
                    </h3>
                    <Badge variant={tenant.active ? "default" : "secondary"} className="text-xs">
                      {tenant.active ? "Active" : "Inactive"}
                    </Badge>
                    {tenant.previewMode && (
                      <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" data-testid={`badge-preview-${tenant.id}`}>
                        <FlaskConical className="h-3 w-3 mr-1" />
                        Preview
                      </Badge>
                    )}
                    {tenant.planName && (
                      <Badge variant="outline" className="text-xs" data-testid={`badge-plan-${tenant.id}`}>
                        <CreditCard className="h-3 w-3 mr-1" />
                        {tenant.planName}
                      </Badge>
                    )}
                    <Badge variant={getStatusVariant(tenant.subscriptionStatus)} className="text-xs" data-testid={`badge-subscription-status-${tenant.id}`}>
                      {tenant.subscriptionStatus || "trialing"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {tenant.slug}{tenant.customDomain ? ` | ${tenant.customDomain}` : ""}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {tenant.locationCount} location{tenant.locationCount !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {tenant.memberCount} member{tenant.memberCount !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" />
                      {tenant.enrollmentCount} enrollment{tenant.enrollmentCount !== 1 ? "s" : ""}
                    </span>
                    {tenant.monthlyPriceCents !== null && (
                      <span className="flex items-center gap-1" data-testid={`text-mrr-${tenant.id}`}>
                        <DollarSign className="h-3.5 w-3.5" />
                        {formatCents(tenant.monthlyPriceCents)}/mo
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEnterSchool(tenant.id)}
                    data-testid={`button-enter-school-${tenant.id}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Enter School
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/platform/tenants/${tenant.id}`)}
                    data-testid={`button-view-details-${tenant.id}`}
                  >
                    <ChevronRight className="h-3.5 w-3.5 mr-1" />
                    View Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredTenants.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No schools found</p>
          </div>
        )}
      </div>
    </div>
  );
}
