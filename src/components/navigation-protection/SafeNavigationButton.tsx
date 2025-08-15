"use client";

import { Button } from "@/components/ui/button";
import { ButtonProps } from "@/components/ui/button";
import { forwardRef } from "react";

interface SafeNavigationButtonProps extends Omit<ButtonProps, 'onClick'> {
  onClick: () => void;
  hasUnsavedChanges?: boolean;
  confirmMessage?: string;
}

export const SafeNavigationButton = forwardRef<
  HTMLButtonElement,
  SafeNavigationButtonProps
>(({ onClick, hasUnsavedChanges = false, confirmMessage = "You have unsaved changes. Are you sure you want to continue?", children, ...props }, ref) => {
  const handleClick = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(confirmMessage);
      if (confirmed) {
        onClick();
      }
    } else {
      onClick();
    }
  };

  return (
    <Button ref={ref} onClick={handleClick} {...props}>
      {children}
    </Button>
  );
});

SafeNavigationButton.displayName = "SafeNavigationButton";