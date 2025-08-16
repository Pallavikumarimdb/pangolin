import { useEffect, useRef, useState } from "react";
import { Path, UseFormReturn } from "react-hook-form";
import { NavigationGuard } from "@/utils/navigationGuard";

export function useFormPersistence<T extends Record<string, any>>(
  form: UseFormReturn<T>,
  storageKey: string,
  excludeFields: Array<keyof T> = []
) {
  const initialValues = useRef<T | null>(null);
  const navigationGuard = NavigationGuard.getInstance();
  const [hasChanges, setHasChanges] = useState(false);

  // Restore saved form state
  useEffect(() => {
    const savedData = sessionStorage.getItem(storageKey);

    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData) as Partial<T>;
        (Object.keys(parsedData) as Array<keyof T>).forEach((key) => {
          if (!excludeFields.includes(key)) {
            const value = parsedData[key];
            if (value !== undefined) {
              form.setValue(key as Path<T>, value);
            }
          }
        });
        setHasChanges(true);
        navigationGuard.setHasUnsavedChanges(true);
      } catch (error) {
        console.warn("Failed to parse saved form data:", error);
      }
    }

    initialValues.current = form.getValues();
  }, [form, storageKey, excludeFields]);

  // Watch form changes and persist
  useEffect(() => {
    const subscription = form.watch((data) => {
      if (initialValues.current) {
        const dataToSave = { ...data };
        excludeFields.forEach((field) => {
          delete (dataToSave as any)[field];
        });
        sessionStorage.setItem(storageKey, JSON.stringify(dataToSave));

        const dirty = form.formState.isDirty;
        setHasChanges(dirty || true); 
        navigationGuard.setHasUnsavedChanges(dirty || true);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, excludeFields, storageKey, navigationGuard]);

  // Clear saved form state when saved
  const clearPersistence = () => {
    sessionStorage.removeItem(storageKey);
    setHasChanges(false);
    navigationGuard.clearUnsavedChanges();
  };

  return { clearPersistence, hasChanges: () => hasChanges };
}
