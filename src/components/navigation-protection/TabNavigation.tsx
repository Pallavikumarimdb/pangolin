"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@app/lib/cn";
import { NavigationGuard } from "@/utils/navigationGuard";
import { UnsavedChangesIndicator } from "./unsaved-changes-indicator";

const TabsRoot = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  hasUnsavedChanges?: boolean;
  onValueChange?: (value: string) => void;
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, children, hasUnsavedChanges, onValueChange, ...props }, ref) => {
  const navigationGuard = NavigationGuard.getInstance();

  const handleTabClick = (e: React.MouseEvent) => {
    if (navigationGuard.getHasUnsavedChanges()) {
      e.preventDefault();
      const confirmed = navigationGuard.confirmNavigation();
      if (confirmed) {
        // Clear state only after confirmation
        navigationGuard.clearUnsavedChanges();
        sessionStorage.clear(); // ensure form state is removed
        if (props.value && onValueChange) {
          onValueChange(props.value);
        }
      }
    }
  };

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      onClick={handleTabClick}
      {...props}
    >
      <span className="flex items-center gap-2">
        {children}
        {hasUnsavedChanges && (
          <UnsavedChangesIndicator
            hasUnsavedChanges={true}
            variant="badge"
            className="scale-75"
          />
        )}
      </span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { TabsRoot as Tabs, TabsList, TabsTrigger, TabsContent };
