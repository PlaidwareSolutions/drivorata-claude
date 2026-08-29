import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Building2, AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const tenantSlug = new URLSearchParams(window.location.search).get("tenant");

  const { data: tenantInfo, isLoading: tenantLoading } = useQuery({
    queryKey: ["/api/public/tenant", tenantSlug],
    queryFn: async () => {
      if (!tenantSlug) return null;
      const res = await fetch(`/api/public/tenant/${encodeURIComponent(tenantSlug)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantSlug,
    staleTime: 1000 * 60 * 30,
  });

  const tenantNotFound = !!tenantSlug && !tenantLoading && !tenantInfo?.tenant;

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLocation("/admin");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loginMutation = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};
      if (!loginEmail) newErrors.email = "Email is required";
      if (!loginPassword) newErrors.password = "Password is required";
      if (Object.keys(newErrors).length) {
        setErrors(newErrors);
        throw new Error("Please fill in all fields");
      }
      setErrors({});
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/platform/membership"] });
      try {
        const memberRes = await fetch("/api/platform/membership", { credentials: "include" });
        if (memberRes.ok) {
          const data = await memberRes.json();
          if (data.isPlatformMember) {
            setLocation("/platform");
            return;
          }
        }
      } catch {}
      setLocation("/admin");
    },
    onError: (error: Error) => {
      if (error.message !== "Please fill in all fields") {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};
      if (!regFirstName.trim()) newErrors.firstName = "First name is required";
      if (!regLastName.trim()) newErrors.lastName = "Last name is required";
      if (!regEmail.trim()) newErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) newErrors.email = "Please enter a valid email";
      if (!regPassword) newErrors.password = "Password is required";
      else if (regPassword.length < 8) newErrors.password = "Password must be at least 8 characters";
      if (!regConfirm) newErrors.confirmPassword = "Please confirm your password";
      else if (regPassword !== regConfirm) newErrors.confirmPassword = "Passwords don't match";
      if (Object.keys(newErrors).length) {
        setErrors(newErrors);
        throw new Error("Please fix the errors");
      }
      setErrors({});
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regEmail.trim().toLowerCase(),
          password: regPassword,
          firstName: regFirstName.trim(),
          lastName: regLastName.trim(),
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/admin");
    },
    onError: (error: Error) => {
      if (error.message !== "Please fix the errors") {
        toast({ title: "Registration failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const switchToRegister = () => {
    setMode("register");
    setLoginEmail("");
    setLoginPassword("");
    setErrors({});
  };

  const switchToLogin = () => {
    setMode("login");
    setRegFirstName("");
    setRegLastName("");
    setRegEmail("");
    setRegPassword("");
    setRegConfirm("");
    setErrors({});
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {tenantInfo?.tenant ? (
              <div className="flex flex-col items-center gap-2 mb-2">
                {tenantInfo.tenant.logoUrl ? (
                  <img src={tenantInfo.tenant.logoUrl} alt={tenantInfo.tenant.name} className="h-10 w-10 rounded" />
                ) : (
                  <Building2 className="h-10 w-10 text-primary" />
                )}
                <span className="font-bold text-lg">{tenantInfo.tenant.name}</span>
                <span className="text-xs text-muted-foreground">Staff Portal · Powered by Drivorata</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 mb-2">
                <img src="/logo.png" alt="Drivorata" className="h-7 w-7" />
                <span className="font-bold text-lg">Drivorata</span>
              </div>
            )}
            <CardTitle data-testid="text-auth-title">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </CardTitle>
            <CardDescription>
              {tenantInfo?.tenant
                ? (mode === "login" ? `Sign in to manage ${tenantInfo.tenant.name}` : "Create your staff account")
                : (mode === "login" ? "Sign in to manage your driving school" : "Get started with Drivorata platform")}
            </CardDescription>
            {tenantNotFound && (
              <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>School "{tenantSlug}" was not found. You can still sign in to your Drivorata account.</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {mode === "login" ? (
              <form
                onSubmit={(e) => { e.preventDefault(); loginMutation.mutate(); }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    data-testid="input-login-email"
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    data-testid="input-login-password"
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  <div className="text-right">
                    <Link href="/forgot-password">
                      <button type="button" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                        Forgot password?
                      </button>
                    </Link>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login-submit">
                  {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>
              </form>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); registerMutation.mutate(); }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="reg-firstname">First Name</Label>
                    <Input
                      id="reg-firstname"
                      placeholder="John"
                      autoComplete="given-name"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      data-testid="input-register-firstname"
                    />
                    {errors.firstName && <p className="text-sm text-destructive">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-lastname">Last Name</Label>
                    <Input
                      id="reg-lastname"
                      placeholder="Doe"
                      autoComplete="family-name"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      data-testid="input-register-lastname"
                    />
                    {errors.lastName && <p className="text-sm text-destructive">{errors.lastName}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    data-testid="input-register-email"
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    data-testid="input-register-password"
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-confirm">Confirm Password</Label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    data-testid="input-register-confirm"
                  />
                  {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register-submit">
                  {registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
              </form>
            )}

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <p>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={switchToRegister}
                    data-testid="button-switch-to-register"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={switchToLogin}
                    data-testid="button-switch-to-login"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-12">
        <div className="max-w-md text-center">
          <img src="/logo.png" alt="Drivorata" className="h-16 w-16 mx-auto mb-6" />
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Turn Driving Schools into High-Performance Ops
          </h2>
          <p className="text-muted-foreground">
            Website builder, scheduling, compliance, fleet management, and payments — all under one system built specifically for Texas driving schools.
          </p>
        </div>
      </div>
    </div>
  );
}
