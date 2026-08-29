import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Link, useSearch } from "wouter";

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const resetMutation = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};
      if (!password) newErrors.password = "Password is required";
      else if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
      if (!confirmPassword) newErrors.confirmPassword = "Please confirm your password";
      else if (password !== confirmPassword) newErrors.confirmPassword = "Passwords don't match";
      if (Object.keys(newErrors).length) {
        setErrors(newErrors);
        throw new Error("Please fix the errors");
      }
      setErrors({});

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      toast({ title: "Password reset!", description: "You can now log in with your new password." });
    },
    onError: (error: Error) => {
      if (error.message !== "Please fix the errors") {
        toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      }
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <img src="/logo.png" alt="Drivorata" className="h-7 w-7" />
              <span className="font-bold text-lg">Drivorata</span>
            </div>
            <CardTitle data-testid="text-reset-title">Invalid Reset Link</CardTitle>
            <CardDescription>This password reset link is missing or invalid.</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">
              Please request a new reset link from the login page.
            </p>
            <Link href="/forgot-password">
              <Button data-testid="button-request-new-link">Request New Reset Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <img src="/logo.png" alt="Drivorata" className="h-7 w-7" />
              <span className="font-bold text-lg">Drivorata</span>
            </div>
            <CardTitle data-testid="text-reset-success-title">Password Reset Successfully</CardTitle>
            <CardDescription>Your password has been updated.</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto" />
            <p className="text-sm text-muted-foreground">
              You can now log in with your new password.
            </p>
            <Link href="/login">
              <Button className="w-full" data-testid="button-go-to-login">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/logo.png" alt="Drivorata" className="h-7 w-7" />
            <span className="font-bold text-lg">Drivorata</span>
          </div>
          <CardTitle data-testid="text-reset-title">Set New Password</CardTitle>
          <CardDescription>Enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); resetMutation.mutate(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-new-password"
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm New Password</Label>
              <Input
                id="confirm-new-password"
                type="password"
                placeholder="Confirm your new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="input-confirm-new-password"
              />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={resetMutation.isPending}
              data-testid="button-reset-submit"
            >
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reset Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
