import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, CheckCircle, Copy, Info } from "lucide-react";
import { Link } from "wouter";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resetLink, setResetLink] = useState("");

  const forgotMutation = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Please enter your email address");
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Something went wrong");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setSubmitted(true);
      if (data.resetToken) {
        const link = `${window.location.origin}/reset-password?token=${data.resetToken}`;
        setResetLink(link);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyLink = () => {
    navigator.clipboard.writeText(resetLink);
    toast({ title: "Copied!", description: "Reset link copied to clipboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/logo.png" alt="Drivorata" className="h-7 w-7" />
            <span className="font-bold text-lg">Drivorata</span>
          </div>
          <CardTitle data-testid="text-forgot-title">
            {submitted
              ? (resetLink ? "Check Your Reset Link" : "Email Not Found")
              : "Forgot Password"}
          </CardTitle>
          <CardDescription>
            {submitted
              ? (resetLink
                  ? "A password reset link has been generated."
                  : "We couldn't find an account with that email.")
              : "Enter your email and we'll generate a reset link for you."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              {resetLink ? (
                <>
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 justify-center">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Reset link generated</span>
                  </div>
                  <div className="space-y-2">
                    <Label>Your reset link</Label>
                    <div className="flex gap-2">
                      <Input
                        value={resetLink}
                        readOnly
                        className="text-xs"
                        data-testid="input-reset-link"
                      />
                      <Button variant="outline" size="icon" onClick={copyLink} data-testid="button-copy-link">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Copy this link and open it in your browser, or share it securely with the account holder. This link expires in 1 hour.
                    </p>
                    <Link href={`/reset-password?token=${resetLink.split("token=")[1]}`}>
                      <Button className="w-full" data-testid="button-go-to-reset">
                        Reset Password Now
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground justify-center">
                    <Info className="h-5 w-5" />
                    <span className="font-medium">No account found</span>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    No account was found with that email address. Please double-check the email and try again.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setSubmitted(false); setResetLink(""); }}
                    data-testid="button-try-again"
                  >
                    Try Again
                  </Button>
                </>
              )}
              <div className="text-center">
                <Link href="/login">
                  <Button variant="ghost" className="gap-2" data-testid="button-back-to-login">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); forgotMutation.mutate(); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email Address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-forgot-email"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={forgotMutation.isPending}
                data-testid="button-forgot-submit"
              >
                {forgotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate Reset Link
              </Button>
              <div className="text-center">
                <Link href="/login">
                  <Button variant="ghost" className="gap-2" data-testid="button-back-to-login-form">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
