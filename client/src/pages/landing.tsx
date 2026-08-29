import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Calendar, Users, Globe, BarChart3, Car } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const features = [
  {
    icon: Globe,
    title: "Custom Websites",
    description: "Each school gets a fully customizable marketing website with their own domain.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Classroom and in-car scheduling with instructor and vehicle resource locking.",
  },
  {
    icon: Shield,
    title: "TDLR Compliance",
    description: "Automated Texas regulatory enforcement with DE-964 export and hour tracking.",
  },
  {
    icon: Car,
    title: "Fleet Management",
    description: "Track vehicles, maintenance schedules, and availability in one place.",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    description: "Admin, office manager, instructor, student, and parent roles with proper permissions.",
  },
  {
    icon: BarChart3,
    title: "Revenue Analytics",
    description: "Revenue dashboards, instructor utilization, and no-show analytics.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-50 bg-background">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Drivorata" className="h-7 w-7" />
            <span className="font-bold text-lg">Drivorata</span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <a href="/admin">
                <Button data-testid="button-go-dashboard">Go to Dashboard</Button>
              </a>
            ) : (
              <a href="/login">
                <Button data-testid="button-login">Log In</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      <section className="relative py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Turn Driving Schools into High-Performance Ops
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Website builder, scheduling, compliance, fleet management, and payments - all
            under one system built specifically for Texas driving schools.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {isAuthenticated ? (
              <a href="/admin">
                <Button size="lg" data-testid="button-hero-dashboard">
                  Go to Dashboard
                </Button>
              </a>
            ) : (
              <a href="/login">
                <Button size="lg" data-testid="button-hero-start">
                  Get Started
                </Button>
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">
            Everything Your Driving School Needs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <Card key={feature.title} className="hover-elevate">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-md bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-8 px-4 text-center text-sm text-muted-foreground">
        Drivorata - Turn Driving Schools into High-Performance Ops
      </footer>
    </div>
  );
}
