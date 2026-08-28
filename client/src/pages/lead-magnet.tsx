import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Car,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Calendar,
  CreditCard,
  Building2,
  Shield,
  MapPin,
  Users,
  BookOpen,
  Clock,
  TrendingUp,
  AlertTriangle,
  Download,
  Star,
  ArrowRight,
  Phone,
  Mail,
  Send,
  Loader2,
  FileText,
  BarChart3,
  Target,
} from "lucide-react";
import heroImg1 from "@assets/images/hero-driving-texas.png";
import heroImg2 from "@assets/images/hero-behind-wheel.png";
import heroImg3 from "@assets/images/hero-parking-lot.png";
import heroImg4 from "@assets/images/hero-graduates.png";
import heroImg5 from "@assets/images/hero-classroom.png";
import heroImg6 from "@assets/images/hero-fleet.png";
import heroImg7 from "@assets/images/hero-instruction.png";
import heroImg8 from "@assets/images/hero-enrollment.png";
import heroImg9 from "@assets/images/hero-texas-road.png";
import heroImg10 from "@assets/images/hero-parallel-parking.png";
import officeImg from "@assets/images/school-office.jpg";
import fleetImg from "@assets/images/fleet-cars.jpg";
import successImg from "@assets/images/student-success.jpg";

const heroImages = [heroImg1, heroImg2, heroImg3, heroImg4, heroImg5, heroImg6, heroImg7, heroImg8, heroImg9, heroImg10];


function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (isInView) {
      let start = 0;
      const duration = 1500;
      const step = Math.ceil(target / (duration / 16));
      const timer = setInterval(() => {
        start += step;
        if (start >= target) {
          setCount(target);
          clearInterval(timer);
        } else {
          setCount(start);
        }
      }, 16);
      return () => clearInterval(timer);
    }
  }, [isInView, target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

function InteractiveSteeringLogo() {
  const [angle, setAngle] = useState(0);
  const [scale, setScale] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [idleAngle, setIdleAngle] = useState(0);
  const dragStartX = useRef(0);
  const logoRef = useRef<HTMLDivElement>(null);
  const idleRef = useRef<number>();

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      if (!isDragging) {
        frame++;
        setIdleAngle(Math.sin(frame * 0.015) * 12);
      }
      idleRef.current = requestAnimationFrame(animate);
    };
    idleRef.current = requestAnimationFrame(animate);
    return () => { if (idleRef.current) cancelAnimationFrame(idleRef.current); };
  }, [isDragging]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    setIsDragging(true);
    setHasInteracted(true);
    setScale(0.95);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX.current;
    const clampedAngle = Math.max(-60, Math.min(60, dx * 0.4));
    setAngle(clampedAngle);
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setAngle(0);
    setScale(1);
  }, []);

  const currentAngle = isDragging ? angle : idleAngle;
  const glowSize = 20 + Math.abs(currentAngle) * 0.8;
  const glowAlpha = 0.15 + Math.abs(currentAngle) / 60 * 0.3;
  const currentScale = isDragging ? scale : isHovered ? 1.1 : 1;

  return (
    <div className="hidden lg:flex items-center justify-center flex-shrink-0">
      <motion.div
        className="relative"
        initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
      >
        <div
          ref={logoRef}
          className="relative cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => { setIsHovered(false); if (!isDragging) setScale(1); }}
          style={{
            transform: `rotate(${currentAngle}deg) scale(${currentScale})`,
            transition: isDragging ? 'none' : 'transform 0.3s ease-out',
          }}
        >
          <img
            src="/logo.png"
            alt="Drivorata"
            draggable={false}
            className="h-48 w-48 xl:h-64 xl:w-64"
            style={{
              filter: `drop-shadow(0 0 ${glowSize}px rgba(255,255,255,${glowAlpha}))`,
              transition: isDragging ? 'filter 0.05s' : 'filter 0.3s ease-out',
            }}
          />
        </div>

        {!hasInteracted && (
          <motion.p
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-white/50 whitespace-nowrap pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 2 }}
          >
            Drag to steer
          </motion.p>
        )}

        <motion.div
          className="absolute -inset-6 rounded-full border border-white/10 pointer-events-none"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute -inset-12 rounded-full border border-white/5 pointer-events-none"
          animate={{ rotate: -360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>
    </div>
  );
}

const toolkitItems = [
  { icon: ClipboardCheck, text: "Website conversion checklist" },
  { icon: CreditCard, text: "Enrollment + payment workflow template" },
  { icon: Calendar, text: "Scheduling & instructor utilization playbook" },
  { icon: Shield, text: "TDLR compliance readiness checklist" },
  { icon: FileText, text: "Sample course package pricing bundles" },
];

const whoCards = [
  { icon: Building2, title: "Single-Location Schools", desc: "Streamline your one-school operation and grow enrollment without the chaos." },
  { icon: MapPin, title: "Multi-Location Schools", desc: "Manage multiple locations from one dashboard with consistent operations." },
  { icon: Users, title: "Schools with Multiple Instructors", desc: "Coordinate instructors, vehicles, and schedules without the headaches." },
  { icon: AlertTriangle, title: "Struggling with No-Shows", desc: "Reduce scheduling chaos and lost revenue from missed appointments." },
];

const outcomes = [
  { icon: Clock, title: "Reduce No-Shows", desc: "Automated reminders and easy rescheduling keep students showing up." },
  { icon: CreditCard, title: "Sell Packages Online", desc: "Accept PayPal and Stripe payments directly from your school website." },
  { icon: MapPin, title: "Multi-Location Ops", desc: "Run operations cleanly across all your locations from one place." },
  { icon: Shield, title: "TDLR Compliance", desc: "Keep records organized and audit-ready at all times." },
  { icon: TrendingUp, title: "Grow Revenue", desc: "Convert more website visitors into paying, enrolled students." },
];

const testimonials = [
  { name: "Maria G.", role: "Owner, SafeDrive Academy", quote: "We went from spreadsheets to a fully automated system in one week. Our enrollment doubled in 3 months." },
  { name: "James T.", role: "Director, Texas Road Ready", quote: "Managing 3 locations used to be a nightmare. Now I can see everything from one dashboard." },
  { name: "Lisa R.", role: "Admin, Capital City Driving", quote: "The TDLR compliance tools alone saved us hours of paperwork every month." },
];

const faqs = [
  { q: "Is this really free?", a: "Yes! The toolkit is completely free with no strings attached. We want to help Texas driving schools succeed, and this is our way of sharing the best practices we've learned." },
  { q: "Do I need Stripe or PayPal?", a: "Not to download the toolkit. However, if you want to accept online payments from students, we support both Stripe and PayPal integration — and the toolkit includes a guide on setting those up." },
  { q: "Can it work for multiple locations?", a: "Absolutely. The platform and toolkit are designed specifically for multi-location schools. You'll find strategies for managing instructors, vehicles, and schedules across all your locations." },
  { q: "Does it support in-class + in-car scheduling?", a: "Yes. Our scheduling system handles both classroom sessions and behind-the-wheel driving lessons, with instructor availability, vehicle assignment, and conflict detection built in." },
  { q: "How do I get access to the platform?", a: "After downloading the toolkit, you can book a free 15-minute demo to see the platform in action. We'll set up your school and get you running in no time." },
];

function useReferralCode() {
  const [referralCode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("ref") || null;
    } catch {
      return null;
    }
  });
  return referralCode;
}

function LeadCaptureForm({ inline = false, idSuffix = "", referralCode = null as string | null }: { inline?: boolean; idSuffix?: string; referralCode?: string | null }) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [city, setCity] = useState("");
  const [locationsRange, setLocationsRange] = useState("");
  const [primaryNeed, setPrimaryNeed] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || null, schoolName, city: city || null, locationsRange: locationsRange || null, primaryNeed: primaryNeed || null, referralCode: referralCode || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong");
      return data;
    },
    onSuccess: () => setSubmitted(true),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (submitted) {
    return (
      <div className={`text-center space-y-4 ${inline ? "py-8" : "py-6"}`}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        </motion.div>
        <h3 className="text-xl font-bold text-foreground">You're all set!</h3>
        <p className="text-muted-foreground">Your toolkit is ready — download it now!</p>
        <Button size="lg" className="w-full text-base font-semibold" onClick={() => window.open("/api/toolkit/download", "_blank")} data-testid={`button-download-toolkit${idSuffix}`}>
          <Download className="h-4 w-4 mr-2" />
          Download Your Free Toolkit (PDF)
        </Button>
        <Button variant="outline" className="mt-2" onClick={() => window.open("https://calendly.com", "_blank")} data-testid={`button-book-demo${idSuffix}`}>
          <Phone className="h-4 w-4 mr-2" />
          Book a 15-min Demo
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submitMutation.mutate(); }}
      className="space-y-3"
      data-testid={`form-lead-capture${idSuffix}`}
    >
      <div>
        <Label htmlFor={`lead-name${idSuffix}`} className="text-sm font-medium">Full Name *</Label>
        <Input id={`lead-name${idSuffix}`} data-testid={`input-lead-name${idSuffix}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" required className="mt-1" />
      </div>
      <div>
        <Label htmlFor={`lead-email${idSuffix}`} className="text-sm font-medium">Work Email *</Label>
        <Input id={`lead-email${idSuffix}`} data-testid={`input-lead-email${idSuffix}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@drivingschool.com" required className="mt-1" />
      </div>
      <div>
        <Label htmlFor={`lead-phone${idSuffix}`} className="text-sm font-medium">Phone (optional)</Label>
        <Input id={`lead-phone${idSuffix}`} data-testid={`input-lead-phone${idSuffix}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(512) 555-0123" className="mt-1" />
      </div>
      <div>
        <Label htmlFor={`lead-school${idSuffix}`} className="text-sm font-medium">School Name *</Label>
        <Input id={`lead-school${idSuffix}`} data-testid={`input-lead-school${idSuffix}`} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="My Driving School" required className="mt-1" />
      </div>
      <div>
        <Label htmlFor={`lead-city${idSuffix}`} className="text-sm font-medium">City</Label>
        <Input id={`lead-city${idSuffix}`} data-testid={`input-lead-city${idSuffix}`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Austin" className="mt-1" />
      </div>
      <div>
        <Label className="text-sm font-medium">Number of Locations</Label>
        <Select value={locationsRange} onValueChange={setLocationsRange}>
          <SelectTrigger data-testid={`select-locations${idSuffix}`} className="mt-1">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 location</SelectItem>
            <SelectItem value="2-3">2–3 locations</SelectItem>
            <SelectItem value="4+">4+ locations</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-medium">Primary Need</Label>
        <Select value={primaryNeed} onValueChange={setPrimaryNeed}>
          <SelectTrigger data-testid={`select-primary-need${idSuffix}`} className="mt-1">
            <SelectValue placeholder="What's most important?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="More enrollments">More enrollments</SelectItem>
            <SelectItem value="Scheduling">Scheduling</SelectItem>
            <SelectItem value="Payments">Payments</SelectItem>
            <SelectItem value="Multi-location">Multi-location</SelectItem>
            <SelectItem value="Compliance">Compliance</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="lg" className="w-full text-base font-semibold" disabled={submitMutation.isPending} data-testid={`button-submit-lead${idSuffix}`}>
        {submitMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><Send className="h-4 w-4 mr-2" /> Send Me the Toolkit</>}
      </Button>
      <p className="text-xs text-muted-foreground text-center">No spam. No credit card required.</p>
    </form>
  );
}

export default function LeadMagnetPage() {
  const { isAuthenticated } = useAuth();
  const referralCode = useReferralCode();
  const formRef = useRef<HTMLDivElement>(null);
  const [showMobileBar, setShowMobileBar] = useState(false);
  const [currentHeroImg, setCurrentHeroImg] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setShowMobileBar(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroImg((prev) => (prev + 1) % heroImages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Drivorata" className="h-10 w-10 sm:h-12 sm:w-12" />
            <span className="font-bold text-xl sm:text-2xl text-foreground">Drivorata</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="default" className="hidden sm:inline-flex text-base" onClick={scrollToForm} data-testid="button-nav-toolkit">
              Get Toolkit
            </Button>
            <a href="/affiliate-program">
              <Button variant="ghost" size="default" className="hidden sm:inline-flex text-base" data-testid="button-nav-affiliates">
                Affiliates
              </Button>
            </a>
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

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {heroImages.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out"
              style={{ opacity: i === currentHeroImg ? 1 : 0 }}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-16 sm:py-24 lg:py-32">
          <div className="flex items-center justify-between gap-8">
            <div className="max-w-2xl">
              <AnimatedSection>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white text-sm font-medium border border-white/30 mb-4">
                  <Shield className="h-3.5 w-3.5" /> Built for Texas Driving Schools
                </span>
              </AnimatedSection>
              <AnimatedSection delay={0.1}>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-tight mb-4">
                  Run Your Driving School <span className="text-primary">Like a Pro</span>
                </h1>
              </AnimatedSection>
              <AnimatedSection delay={0.2}>
                <p className="text-base sm:text-lg text-gray-300 mb-6 max-w-lg">
                  Get the free toolkit that helps Texas driving schools enroll more students, simplify scheduling, and stay TDLR compliant.
                </p>
              </AnimatedSection>
              <AnimatedSection delay={0.3}>
                <Button size="lg" onClick={scrollToForm} className="text-base font-semibold px-8 py-6 rounded-xl shadow-lg" data-testid="button-hero-cta">
                  <Download className="h-5 w-5 mr-2" />
                  Get the Free Toolkit
                </Button>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-6 text-xs sm:text-sm text-gray-400">
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Multi-location</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Scheduling</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Payments</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> TDLR Approved</span>
                </div>
              </AnimatedSection>
            </div>

            <InteractiveSteeringLogo />
          </div>
        </div>
      </section>

      {/* ============ STATS BAR ============ */}
      <section className="bg-primary text-primary-foreground py-6">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl sm:text-3xl font-bold"><AnimatedCounter target={500} suffix="+" /></p>
            <p className="text-xs sm:text-sm opacity-80">Schools Supported</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold"><AnimatedCounter target={15000} suffix="+" /></p>
            <p className="text-xs sm:text-sm opacity-80">Students Enrolled</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold"><AnimatedCounter target={98} suffix="%" /></p>
            <p className="text-xs sm:text-sm opacity-80">TDLR Pass Rate</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold"><AnimatedCounter target={40} suffix="%" /></p>
            <p className="text-xs sm:text-sm opacity-80">Less No-Shows</p>
          </div>
        </div>
      </section>

      {/* ============ MAIN CONTENT WITH STICKY FORM ============ */}
      <div className="max-w-7xl mx-auto px-4 py-12 lg:py-16">
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-12">
          {/* Left Column — Content */}
          <div className="space-y-16 lg:space-y-20">

            {/* ---------- TOOLKIT OFFER ---------- */}
            <AnimatedSection>
              <section id="toolkit">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Free Growth + Operations Toolkit</h2>
                    <p className="text-muted-foreground text-sm">Everything you need to modernize your driving school</p>
                  </div>
                </div>
                <div className="relative rounded-2xl overflow-hidden mb-6">
                  <img src={officeImg} alt="Modern driving school" className="w-full h-48 sm:h-64 object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-white font-semibold text-lg">Texas Driving School Growth + Operations Toolkit</p>
                    <p className="text-gray-300 text-sm">5 actionable resources in one download</p>
                  </div>
                </div>
                <div className="grid gap-3">
                  {toolkitItems.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <item.icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{item.text}</span>
                    </motion.div>
                  ))}
                </div>
              </section>
            </AnimatedSection>

            {/* ---------- WHO IT'S FOR ---------- */}
            <AnimatedSection>
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Who This Is For</h2>
                <p className="text-muted-foreground mb-6">Whether you have one location or ten, we've got you covered.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {whoCards.map((card, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <Card className="h-full hover:shadow-md transition-shadow border-border/60 group">
                        <CardContent className="p-5">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                            <card.icon className="h-5 w-5 text-primary" />
                          </div>
                          <h3 className="font-semibold text-foreground mb-1">{card.title}</h3>
                          <p className="text-sm text-muted-foreground">{card.desc}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </section>
            </AnimatedSection>

            {/* ---------- OUTCOMES ---------- */}
            <AnimatedSection>
              <section className="relative">
                <div className="relative rounded-2xl overflow-hidden mb-8">
                  <img src={fleetImg} alt="Driving school fleet" className="w-full h-48 sm:h-56 object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-primary/40 flex items-center">
                    <div className="px-6">
                      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">What You'll Achieve</h2>
                      <p className="text-white/80 text-sm sm:text-base">Real outcomes from real driving schools using these strategies</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4">
                  {outcomes.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -30 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                        <item.icon className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            </AnimatedSection>

            {/* ---------- SOCIAL PROOF ---------- */}
            <AnimatedSection>
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Trusted by Texas Driving Schools</h2>
                <p className="text-muted-foreground mb-6">Hear from school owners who transformed their operations.</p>
                <div className="grid gap-4">
                  {testimonials.map((t, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15 }}
                    >
                      <Card className="border-border/60">
                        <CardContent className="p-5">
                          <div className="flex gap-1 mb-3">
                            {[...Array(5)].map((_, j) => <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
                          </div>
                          <p className="text-sm text-foreground mb-3 italic">"{t.quote}"</p>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-bold text-primary">{t.name[0]}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{t.name}</p>
                              <p className="text-xs text-muted-foreground">{t.role}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-6 rounded-xl bg-muted/50 border border-border/50 p-4">
                  <div className="flex items-center justify-center gap-6 flex-wrap">
                    <img src={successImg} alt="Student success" className="h-12 w-12 rounded-full object-cover" />
                    <p className="text-sm text-muted-foreground">Trusted by <strong className="text-foreground">500+</strong> driving schools across Texas</p>
                  </div>
                </div>
              </section>
            </AnimatedSection>

            {/* ---------- FAQ ---------- */}
            <AnimatedSection>
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Frequently Asked Questions</h2>
                <p className="text-muted-foreground mb-6">Got questions? We've got answers.</p>
                <Accordion type="single" collapsible className="space-y-2">
                  {faqs.map((faq, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="border rounded-lg px-4">
                      <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline" data-testid={`accordion-faq-${i}`}>
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            </AnimatedSection>

            {/* ---------- INLINE FORM (mobile) ---------- */}
            <div id="mobile-form" className="lg:hidden">
              <AnimatedSection>
                <Card className="border-2 border-primary/20 shadow-lg">
                  <CardContent className="p-6">
                    <div className="text-center mb-4">
                      <h3 className="text-xl font-bold text-foreground">Get Your Free Toolkit</h3>
                      <p className="text-sm text-muted-foreground">Fill out the form below and we'll send it to your inbox.</p>
                    </div>
                    <LeadCaptureForm inline idSuffix="-mobile" referralCode={referralCode} />
                  </CardContent>
                </Card>
              </AnimatedSection>
            </div>
          </div>

          {/* Right Column — Sticky Form (desktop) */}
          <div className="hidden lg:block">
            <div ref={formRef} className="sticky top-20">
              <Card className="border-2 border-primary/20 shadow-xl">
                <CardContent className="p-6">
                  <div className="text-center mb-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Download className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">Get Your Free Toolkit</h3>
                    <p className="text-sm text-muted-foreground">5 resources to grow your school</p>
                  </div>
                  <LeadCaptureForm idSuffix="-desktop" referralCode={referralCode} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* ============ BOTTOM CTA ============ */}
      <section className="bg-primary text-primary-foreground py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <AnimatedSection>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to Modernize Your Driving School?</h2>
            <p className="text-sm sm:text-base opacity-80 mb-6">Join hundreds of Texas driving schools already using these strategies.</p>
            <Button size="lg" variant="secondary" onClick={scrollToForm} className="text-base font-semibold px-8" data-testid="button-bottom-cta">
              <Download className="h-5 w-5 mr-2" />
              Get the Free Toolkit
            </Button>
          </AnimatedSection>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Drivorata" className="h-10 w-10 sm:h-12 sm:w-12" />
              <span className="font-bold text-xl sm:text-2xl text-foreground">Drivorata</span>
            </div>
            <p className="text-xs text-muted-foreground">Built for Texas driving schools. TDLR compliant.</p>
            <div className="flex items-center gap-4">
              <a href="/affiliate-program" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-affiliates">Affiliates</a>
              {isAuthenticated ? (
                <a href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
              ) : (
                <a href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Log In</a>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* ============ MOBILE STICKY BAR ============ */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: showMobileBar ? 0 : 100 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background/95 backdrop-blur border-t shadow-lg p-3"
      >
        <Button size="lg" className="w-full text-base font-semibold" onClick={scrollToForm} data-testid="button-mobile-sticky-cta">
          <Download className="h-5 w-5 mr-2" />
          Get the Free Toolkit
        </Button>
      </motion.div>
    </div>
  );
}