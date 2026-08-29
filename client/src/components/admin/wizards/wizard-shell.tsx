import { ReactNode, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

export interface WizardStep {
  key: string;
  title: string;
  description?: string;
}

interface WizardShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  steps: WizardStep[];
  currentStepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  isSubmitting: boolean;
  submitLabel?: string;
  testIdPrefix: string;
  isDirty?: boolean;
  children: ReactNode;
}

export function WizardShell({
  open,
  onOpenChange,
  title,
  description,
  steps,
  currentStepIndex,
  onBack,
  onNext,
  onSubmit,
  canGoBack,
  canGoNext,
  isSubmitting,
  submitLabel = "Submit",
  testIdPrefix,
  isDirty,
  children,
}: WizardShellProps) {
  const isLastStep = currentStepIndex === steps.length - 1;
  const currentStep = steps[currentStepIndex];
  const bodyRef = useRef<HTMLDivElement>(null);

  function handleOpenChange(next: boolean) {
    if (!next && open && isDirty && !isSubmitting) {
      const ok = window.confirm(
        "You have unsaved changes. Close this wizard and discard them?",
      );
      if (!ok) return;
    }
    onOpenChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || isSubmitting) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    if (tag === "TEXTAREA") return;
    if (tag === "BUTTON" && target.getAttribute("type") !== "button") return;
    if (target.getAttribute("contenteditable") === "true") return;
    if (target.getAttribute("role") === "combobox") return;
    if (target.closest("[data-prevent-wizard-enter]")) return;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!canGoNext) return;
    e.preventDefault();
    if (isLastStep) {
      onSubmit();
    } else {
      onNext();
    }
  }

  // Reset focus to the dialog when step changes for predictable Enter target
  useEffect(() => {
    if (!open) return;
    bodyRef.current?.focus({ preventScroll: true });
  }, [currentStepIndex, open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[960px] max-h-[92vh] overflow-hidden flex flex-col"
        data-testid={`dialog-${testIdPrefix}`}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle data-testid={`text-${testIdPrefix}-title`}>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex items-center gap-1 mb-3 mt-2 flex-wrap" data-testid={`stepper-${testIdPrefix}`}>
          {steps.map((step, idx) => {
            const isComplete = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            return (
              <div key={step.key} className="flex items-center gap-1 flex-1 min-w-[80px]">
                <div
                  className={cn(
                    "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-medium border",
                    isComplete && "bg-primary text-primary-foreground border-primary",
                    isCurrent && "bg-primary/20 border-primary text-primary",
                    !isComplete && !isCurrent && "bg-muted text-muted-foreground border-muted",
                  )}
                  data-testid={`step-indicator-${testIdPrefix}-${idx}`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <div className="hidden sm:flex flex-col flex-1 min-w-0">
                  <span className={cn(
                    "text-xs font-medium truncate",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {step.title}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          ref={bodyRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto pr-1 -mr-1 min-h-[280px] outline-none"
          data-testid={`step-body-${testIdPrefix}-${currentStep?.key}`}
        >
          {children}
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={!canGoBack || isSubmitting}
            data-testid={`button-${testIdPrefix}-back`}
          >
            Back
          </Button>
          <div className="text-xs text-muted-foreground">
            Step {currentStepIndex + 1} of {steps.length}
          </div>
          {isLastStep ? (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={!canGoNext || isSubmitting}
              data-testid={`button-${testIdPrefix}-submit`}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {submitLabel}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onNext}
              disabled={!canGoNext || isSubmitting}
              data-testid={`button-${testIdPrefix}-next`}
            >
              Next
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
