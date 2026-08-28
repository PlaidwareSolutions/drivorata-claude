import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DollarSign,
  TrendingUp,
  Users,
  Repeat,
  Gift,
  Store,
  CheckCircle2,
  ArrowRight,
  Shield,
  Clock,
  BarChart3,
  Zap,
  Loader2,
  Send,
} from "lucide-react";
import { Link } from "wouter";

interface AffiliateInfo {
  enabledModels: string[];
  recurringDefaultRate: number;
  hybridDefaultUpfrontCents: number;
  hybridDefaultRecurringRate: number;
  resellerDefaultWholesaleCents: number;
  tierSilverThreshold: number;
  tierGoldThreshold: number;
  tierSilverBonusRate: number;
  tierGoldBonusRate: number;
  minRetentionMonths: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AffiliateProgramPage() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    website: "",
    preferredModel: "",
    experience: "",
  });

  const { data: info, isLoading } = useQuery<AffiliateInfo>({
    queryKey: ["/api/public/affiliate-program-info"],
  });

  const applyMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/public/affiliate-apply", data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Application submitted!", description: "We'll review your application and get back to you soon." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit application", variant: "destructive" });
    },
  });

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({ title: "Missing fields", description: "Please fill in your first name, last name, and email.", variant: "destructive" });
      return;
    }
    applyMutation.mutate(formData);
  };

  const recurringRate = info?.recurringDefaultRate ?? 25;
  const hybridUpfront = info?.hybridDefaultUpfrontCents ?? 30000;
  const hybridRate = info?.hybridDefaultRecurringRate ?? 15;
  const wholesaleCents = info?.resellerDefaultWholesaleCents ?? 18000;
  const silverThreshold = info?.tierSilverThreshold ?? 10;
  const goldThreshold = info?.tierGoldThreshold ?? 25;
  const silverRate = info?.tierSilverBonusRate ?? 30;
  const goldRate = info?.tierGoldBonusRate ?? 35;
  const retentionMonths = info?.minRetentionMonths ?? 2;
  const enabledModels = info?.enabledModels ?? ["recurring", "hybrid", "reseller"];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img src="/logo.png" alt="Drivorata" className="h-10 w-10 sm:h-12 sm:w-12" />
              <span className="font-bold text-xl sm:text-2xl text-foreground">Drivorata</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="default" className="hidden sm:inline-flex text-base" data-testid="button-nav-home">
                Home
              </Button>
            </Link>
            {isAuthenticated ? (
              <a href="/admin">
                <Button size="default" className="text-base" data-testid="button-nav-dashboard">Dashboard</Button>
              </a>
            ) : (
              <a href="/login">
                <Button variant="outline" size="default" className="text-base" data-testid="button-nav-login">Log In</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20 mb-4" data-testid="badge-affiliate-program">
              <DollarSign className="h-3.5 w-3.5" /> Partner Program
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground leading-tight mb-4" data-testid="text-affiliate-heading">
              Earn by Referring <span className="text-primary">Driving Schools</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join the Drivorata Affiliate Program and earn commissions every time you refer a driving school that signs up. Choose the model that works best for you.
            </p>
            <Button size="lg" className="text-base font-semibold px-8 py-6 rounded-xl shadow-lg" data-testid="button-apply-hero" onClick={scrollToForm}>
              Apply to Become a Partner
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2" data-testid="text-how-it-works">How It Works</h2>
            <p className="text-muted-foreground">Three simple steps to start earning</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: "1", icon: Users, title: "Apply & Get Approved", desc: "Fill out a quick application. Once approved, you'll get a unique referral link and access to your affiliate dashboard." },
              { step: "2", icon: TrendingUp, title: "Share Your Link", desc: "Share your referral link with driving school owners. When they sign up through your link, the referral is tracked automatically." },
              { step: "3", icon: DollarSign, title: "Earn Commissions", desc: "Get paid for every school that joins through your referral. Choose from three flexible commission models." },
            ].map((item) => (
              <Card key={item.step} className="text-center" data-testid={`card-step-${item.step}`}>
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Step {item.step}</div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2" data-testid="text-commission-models">
              {enabledModels.length === 1 ? "Commission Model" : enabledModels.length === 2 ? "Two Commission Models" : "Three Commission Models"}
            </h2>
            <p className="text-muted-foreground">Pick the model that fits your style</p>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-2"><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-6 ${enabledModels.length === 1 ? "md:grid-cols-1 max-w-md mx-auto" : enabledModels.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "md:grid-cols-3"}`}>
              {enabledModels.includes("recurring") && (
                <Card className="border-2 hover:border-primary/50 transition-colors" data-testid="card-model-recurring">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Repeat className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Recurring Commission</h3>
                        <p className="text-xs text-muted-foreground">Earn every month</p>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-foreground mb-1" data-testid="text-recurring-rate">{recurringRate}%</div>
                    <p className="text-sm text-muted-foreground mb-4">of each school's monthly payment, paid every month for the lifetime of the customer.</p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground" data-testid="text-recurring-range">Starts at {recurringRate}%, grows to {goldRate}%</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground" data-testid="text-recurring-tiers">Tier bonuses at {silverThreshold}+ and {goldThreshold}+ schools</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">Lifetime recurring income</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {enabledModels.includes("hybrid") && (
                <Card className="border-2 hover:border-primary/50 transition-colors" data-testid="card-model-hybrid">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                        <Gift className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Hybrid Model</h3>
                        <p className="text-xs text-muted-foreground">Upfront + recurring</p>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-foreground mb-1" data-testid="text-hybrid-rate">{formatCents(hybridUpfront)} <span className="text-lg font-normal text-muted-foreground">+ {hybridRate}%</span></div>
                    <p className="text-sm text-muted-foreground mb-4">One-time upfront bonus per school, plus a recurring monthly percentage.</p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground" data-testid="text-hybrid-upfront">{formatCents(hybridUpfront)} upfront per signed school</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground" data-testid="text-hybrid-recurring">{hybridRate}% monthly recurring on top</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">Best of both worlds</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {enabledModels.includes("reseller") && (
                <Card className="border-2 hover:border-primary/50 transition-colors" data-testid="card-model-reseller">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400 flex items-center justify-center">
                        <Store className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Reseller / Agency</h3>
                        <p className="text-xs text-muted-foreground">Set your own price</p>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-foreground mb-1" data-testid="text-reseller-price">{formatCents(wholesaleCents)} <span className="text-lg font-normal text-muted-foreground">wholesale</span></div>
                    <p className="text-sm text-muted-foreground mb-4">Buy at wholesale and sell at your own price. Keep the entire margin.</p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground" data-testid="text-reseller-wholesale">Platform charges {formatCents(wholesaleCents)}/mo wholesale</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">You set the retail price</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">Keep 100% of the margin</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2" data-testid="text-tier-progression">Grow Your Earnings with Tiers</h2>
            <p className="text-muted-foreground">The more schools you refer, the more you earn</p>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="text-center"><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[
                { tier: "Base", threshold: `0+ schools`, rate: `${recurringRate}%`, color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
                { tier: "Silver", threshold: `${silverThreshold}+ schools`, rate: `${silverRate}%`, color: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200" },
                { tier: "Gold", threshold: `${goldThreshold}+ schools`, rate: `${goldRate}%`, color: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300" },
              ].map((t) => (
                <Card key={t.tier} className="text-center" data-testid={`card-tier-${t.tier.toLowerCase()}`}>
                  <CardContent className="pt-6">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium mb-3 ${t.color}`}>
                      {t.tier}
                    </div>
                    <div className="text-3xl font-bold text-foreground mb-1">{t.rate}</div>
                    <p className="text-sm text-muted-foreground">{t.threshold}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2" data-testid="text-why-partner">Why Partner With Drivorata?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: BarChart3, title: "Real-Time Dashboard", desc: "Track referrals, commissions, and payouts from your dedicated affiliate portal." },
              { icon: Zap, title: "Instant Tracking", desc: "Every referral is tracked automatically via your unique link. No manual reporting." },
              { icon: Shield, title: "Fair Protections", desc: `${retentionMonths}-month retention minimum before commissions activate. No commission on refunds.` },
              { icon: Clock, title: "Net-30 Payouts", desc: "Approved commissions are paid out on a Net-30 schedule. Reliable and transparent." },
            ].map((item) => (
              <Card key={item.title} data-testid={`card-benefit-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                <CardContent className="pt-6">
                  <item.icon className="h-8 w-8 text-primary mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-muted/30" ref={formRef} id="apply">
        <div className="max-w-2xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2" data-testid="text-apply-heading">Apply to Become a Partner</h2>
            <p className="text-muted-foreground">Fill out the form below and we'll get back to you within 1-2 business days.</p>
          </div>

          {submitted ? (
            <Card className="border-2 border-green-200 dark:border-green-800" data-testid="card-application-success">
              <CardContent className="pt-8 pb-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Application Submitted!</h3>
                <p className="text-muted-foreground">Thank you for your interest in the Drivorata Affiliate Program. Our team will review your application and reach out shortly.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-2" data-testid="card-application-form">
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        required
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        required
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        data-testid="input-phone"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company">Company / Organization</Label>
                      <Input
                        id="company"
                        placeholder="Your company name"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        data-testid="input-company"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        type="url"
                        placeholder="https://yoursite.com"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        data-testid="input-website"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preferredModel">Preferred Commission Model</Label>
                    <Select value={formData.preferredModel} onValueChange={(v) => setFormData({ ...formData, preferredModel: v })}>
                      <SelectTrigger data-testid="select-preferred-model">
                        <SelectValue placeholder="Select a model (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {enabledModels.includes("recurring") && <SelectItem value="recurring">Recurring Commission ({recurringRate}%)</SelectItem>}
                        {enabledModels.includes("hybrid") && <SelectItem value="hybrid">Hybrid ({formatCents(hybridUpfront)} + {hybridRate}%)</SelectItem>}
                        {enabledModels.includes("reseller") && <SelectItem value="reseller">Reseller / Agency ({formatCents(wholesaleCents)} wholesale)</SelectItem>}
                        <SelectItem value="undecided">Not sure yet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="experience">Tell us about yourself</Label>
                    <Textarea
                      id="experience"
                      placeholder="How do you plan to refer driving schools? Any relevant experience or networks?"
                      value={formData.experience}
                      onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                      rows={4}
                      data-testid="textarea-experience"
                    />
                  </div>

                  <Button type="submit" size="lg" className="w-full text-base font-semibold" disabled={applyMutation.isPending} data-testid="button-submit-application">
                    {applyMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5 mr-2" />
                        Submit Application
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="bg-primary text-primary-foreground py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" data-testid="text-bottom-cta">Ready to Start Earning?</h2>
          <p className="text-sm sm:text-base opacity-80 mb-6">Apply today and start referring driving schools to Drivorata. It only takes a few minutes to get set up.</p>
          <Button size="lg" variant="secondary" className="text-base font-semibold px-8" data-testid="button-apply-bottom" onClick={scrollToForm}>
            Apply Now
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </section>

      <footer className="border-t bg-muted/30 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <img src="/logo.png" alt="Drivorata" className="h-10 w-10 sm:h-12 sm:w-12" />
                <span className="font-bold text-xl sm:text-2xl text-foreground">Drivorata</span>
              </div>
            </Link>
            <p className="text-xs text-muted-foreground">Built for Texas driving schools. TDLR compliant.</p>
            <div className="flex items-center gap-4">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-home">Home</Link>
              {isAuthenticated ? (
                <a href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
              ) : (
                <a href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Log In</a>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
