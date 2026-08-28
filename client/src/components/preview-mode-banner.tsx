import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Rocket, FlaskConical, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";

export function PreviewModeBanner() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const goLiveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant selected");
      const res = await apiRequest("POST", `/api/tenants/${currentTenant.tenant.id}/go-live`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to go live");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({
        title: "You're now live!",
        description: data.message || "Start by adding your packages and locations.",
        duration: 8000,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!currentTenant?.tenant?.previewMode) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800"
      data-testid="banner-preview-mode"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300 truncate">
          <span className="font-semibold">Preview Mode</span>
          <span className="hidden sm:inline"> — this school is running on demo data. Explore all features, then go live when you're ready.</span>
        </p>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
            data-testid="button-go-live"
          >
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            Go Live
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent data-testid="dialog-go-live">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Go Live — Clear Demo Data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                This will permanently delete all demo data including:
              </span>
              <ul className="list-disc list-inside text-sm space-y-1 ml-1">
                <li>All sessions and schedules</li>
                <li>All enrollments and bookings</li>
                <li>All packages, vehicles, and locations</li>
                <li>All demo student, instructor, and parent accounts</li>
              </ul>
              <span className="block mt-2 font-medium text-foreground">
                Your admin account, theme, website pages, and settings will be preserved.
              </span>
              <span className="block text-destructive font-medium">
                This cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-go-live-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                goLiveMutation.mutate();
              }}
              disabled={goLiveMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-go-live-confirm"
            >
              {goLiveMutation.isPending ? "Going Live..." : "Yes, Go Live"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
