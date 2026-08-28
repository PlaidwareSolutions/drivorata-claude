import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Repeat, Layers, Store, Shield, Save } from "lucide-react";
import type { MarketingProgramSettings } from "@shared/schema";

export default function MarketingSettingsPage() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<MarketingProgramSettings>({
    queryKey: ["/api/platform/marketing-settings"],
  });

  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [recurringDefaultRate, setRecurringDefaultRate] = useState(25);
  const [hybridDefaultUpfrontCents, setHybridDefaultUpfrontCents] = useState(30000);
  const [hybridDefaultRecurringRate, setHybridDefaultRecurringRate] = useState(15);
  const [resellerDefaultWholesaleCents, setResellerDefaultWholesaleCents] = useState(18000);
  const [tierSilverThreshold, setTierSilverThreshold] = useState(10);
  const [tierGoldThreshold, setTierGoldThreshold] = useState(25);
  const [tierSilverBonusRate, setTierSilverBonusRate] = useState(30);
  const [tierGoldBonusRate, setTierGoldBonusRate] = useState(35);
  const [minRetentionMonths, setMinRetentionMonths] = useState(2);

  useEffect(() => {
    if (settings) {
      setEnabledModels(settings.enabledModels || []);
      setRecurringDefaultRate(settings.recurringDefaultRate);
      setHybridDefaultUpfrontCents(settings.hybridDefaultUpfrontCents);
      setHybridDefaultRecurringRate(settings.hybridDefaultRecurringRate);
      setResellerDefaultWholesaleCents(settings.resellerDefaultWholesaleCents);
      setTierSilverThreshold(settings.tierSilverThreshold);
      setTierGoldThreshold(settings.tierGoldThreshold);
      setTierSilverBonusRate(settings.tierSilverBonusRate);
      setTierGoldBonusRate(settings.tierGoldBonusRate);
      setMinRetentionMonths(settings.minRetentionMonths);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<MarketingProgramSettings>) => {
      const res = await apiRequest("PATCH", "/api/platform/marketing-settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/marketing-settings"] });
      toast({ title: "Settings saved", description: "Marketing program settings have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  function toggleModel(model: string) {
    setEnabledModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  }

  function handleSave() {
    saveMutation.mutate({
      enabledModels,
      recurringDefaultRate,
      hybridDefaultUpfrontCents,
      hybridDefaultRecurringRate,
      resellerDefaultWholesaleCents,
      tierSilverThreshold,
      tierGoldThreshold,
      tierSilverBonusRate,
      tierGoldBonusRate,
      minRetentionMonths,
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const isRecurringEnabled = enabledModels.includes("recurring");
  const isHybridEnabled = enabledModels.includes("hybrid");
  const isResellerEnabled = enabledModels.includes("reseller");

  return (
    <div className="p-6 space-y-6" data-testid="page-marketing-settings">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Marketing Program Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure commission models, tier thresholds, and default rates for your affiliate program.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-settings">
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card data-testid="card-recurring-model">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Recurring Commission</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isRecurringEnabled && <Badge variant="default">Active</Badge>}
              <Switch
                checked={isRecurringEnabled}
                onCheckedChange={() => toggleModel("recurring")}
                data-testid="switch-recurring-enabled"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Percentage of tenant's monthly payment, paid monthly for the lifetime of the customer.
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="recurring-rate">Default Commission Rate (%)</Label>
                <Input
                  id="recurring-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={recurringDefaultRate}
                  onChange={(e) => setRecurringDefaultRate(Number(e.target.value))}
                  disabled={!isRecurringEnabled}
                  data-testid="input-recurring-rate"
                />
              </div>
              <div className="border-t pt-3">
                <Label className="text-sm font-medium">Performance Tiers</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Affiliates advance to higher tiers as they refer more schools.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="silver-threshold" className="w-32 text-sm">Silver Threshold</Label>
                    <Input
                      id="silver-threshold"
                      type="number"
                      min={1}
                      className="flex-1 min-w-[80px]"
                      value={tierSilverThreshold}
                      onChange={(e) => setTierSilverThreshold(Number(e.target.value))}
                      disabled={!isRecurringEnabled}
                      data-testid="input-silver-threshold"
                    />
                    <span className="text-xs text-muted-foreground">schools</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="silver-bonus" className="w-32 text-sm">Silver Bonus Rate</Label>
                    <Input
                      id="silver-bonus"
                      type="number"
                      min={0}
                      max={100}
                      className="flex-1 min-w-[80px]"
                      value={tierSilverBonusRate}
                      onChange={(e) => setTierSilverBonusRate(Number(e.target.value))}
                      disabled={!isRecurringEnabled}
                      data-testid="input-silver-bonus-rate"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="gold-threshold" className="w-32 text-sm">Gold Threshold</Label>
                    <Input
                      id="gold-threshold"
                      type="number"
                      min={1}
                      className="flex-1 min-w-[80px]"
                      value={tierGoldThreshold}
                      onChange={(e) => setTierGoldThreshold(Number(e.target.value))}
                      disabled={!isRecurringEnabled}
                      data-testid="input-gold-threshold"
                    />
                    <span className="text-xs text-muted-foreground">schools</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="gold-bonus" className="w-32 text-sm">Gold Bonus Rate</Label>
                    <Input
                      id="gold-bonus"
                      type="number"
                      min={0}
                      max={100}
                      className="flex-1 min-w-[80px]"
                      value={tierGoldBonusRate}
                      onChange={(e) => setTierGoldBonusRate(Number(e.target.value))}
                      disabled={!isRecurringEnabled}
                      data-testid="input-gold-bonus-rate"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-hybrid-model">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Hybrid Commission</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isHybridEnabled && <Badge variant="default">Active</Badge>}
              <Switch
                checked={isHybridEnabled}
                onCheckedChange={() => toggleModel("hybrid")}
                data-testid="switch-hybrid-enabled"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              One-time upfront bonus per signed school plus a lower recurring percentage.
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="hybrid-upfront">Default Upfront Bonus ($)</Label>
                <Input
                  id="hybrid-upfront"
                  type="number"
                  min={0}
                  step={1}
                  value={hybridDefaultUpfrontCents / 100}
                  onChange={(e) => setHybridDefaultUpfrontCents(Math.round(Number(e.target.value) * 100))}
                  disabled={!isHybridEnabled}
                  data-testid="input-hybrid-upfront"
                />
              </div>
              <div>
                <Label htmlFor="hybrid-recurring">Default Recurring Rate (%)</Label>
                <Input
                  id="hybrid-recurring"
                  type="number"
                  min={0}
                  max={100}
                  value={hybridDefaultRecurringRate}
                  onChange={(e) => setHybridDefaultRecurringRate(Number(e.target.value))}
                  disabled={!isHybridEnabled}
                  data-testid="input-hybrid-recurring-rate"
                />
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Hybrid model shares the same tier thresholds and bonus rates as the Recurring model (configured above).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-reseller-model">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Reseller / Agency</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isResellerEnabled && <Badge variant="default">Active</Badge>}
              <Switch
                checked={isResellerEnabled}
                onCheckedChange={() => toggleModel("reseller")}
                data-testid="switch-reseller-enabled"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Affiliate buys at a wholesale price and sells at their own price, keeping the margin.
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="reseller-wholesale">Default Wholesale Price ($)</Label>
                <Input
                  id="reseller-wholesale"
                  type="number"
                  min={0}
                  step={1}
                  value={resellerDefaultWholesaleCents / 100}
                  onChange={(e) => setResellerDefaultWholesaleCents(Math.round(Number(e.target.value) * 100))}
                  disabled={!isResellerEnabled}
                  data-testid="input-reseller-wholesale"
                />
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  No percentage-based commission. The affiliate keeps the difference between the wholesale price and their selling price.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-general-settings">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">General Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="min-retention">Minimum Retention (months)</Label>
            <Input
              id="min-retention"
              type="number"
              min={0}
              value={minRetentionMonths}
              onChange={(e) => setMinRetentionMonths(Number(e.target.value))}
              data-testid="input-min-retention"
            />
            <p className="text-xs text-muted-foreground">
              Referred tenants must remain active for this many months before commissions are activated.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
