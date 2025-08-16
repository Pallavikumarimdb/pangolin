"use client";

import { AlertCircle, Save } from "lucide-react";
import { cn } from "@app/lib/cn";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UnsavedChangesIndicatorProps {
  hasUnsavedChanges: boolean;
  onSave?: () => Promise<void> | void; // allow async
  isSaving?: boolean;
  className?: string;
  variant?: "badge" | "alert" | "button";
}

export function UnsavedChangesIndicator({
  hasUnsavedChanges,
  onSave,
  isSaving = false,
  className,
  variant = "badge"
}: UnsavedChangesIndicatorProps) {
  if (!hasUnsavedChanges) return null;

  const handleSaveClick = async () => {
    if (onSave) {
      await onSave();
    }
  };

  if (variant === "alert") {
    return (
      <Alert variant="default" className={cn("mb-4", className)}>
        <AlertCircle className="h-4 w-4" color="red" />
        <AlertDescription className="flex items-center justify-between">
          <span>You have unsaved changes</span>
          {onSave && (
            <Button
              size="sm"
              onClick={handleSaveClick}
              loading={isSaving}
              disabled={isSaving}
            >
              <Save className="h-3 w-3 mr-1" />
              Save Changes
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (variant === "button") {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleSaveClick}
        loading={isSaving}
        disabled={isSaving}
        className={cn("ml-2", className)}
      >
        <Save className="h-3 w-3 mr-1" />
        Save Changes
      </Button>
    );
  }

  // Default badge variant
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium",
        "bg-amber-100 text-amber-800 rounded-full border border-amber-200",
        "dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
        className
      )}
    >
      <AlertCircle className="h-3 w-3" />
      Unsaved changes
    </div>
  );
}
