import { UseFormReturn, FieldValues } from 'react-hook-form';
import { useUnsavedChanges } from './useUnsavedChanges';
import { useFormPersistence } from './useFormPersistence';

interface UseFormWithUnsavedChangesOptions<T extends FieldValues> {
  form: UseFormReturn<T>;
  storageKey: string;
  excludeFields?: (keyof T)[];
  warningMessage?: string;
}

export function useFormWithUnsavedChanges<T extends FieldValues>({
  form,
  storageKey,
  excludeFields = [],
  warningMessage
}: UseFormWithUnsavedChangesOptions<T>) {
  const { clearPersistence, hasChanges } = useFormPersistence(
    form,
    storageKey,
    excludeFields
  );

  const { safeNavigate, setIsNavigating } = useUnsavedChanges({
    hasUnsavedChanges: hasChanges(),
    message: warningMessage
  });

  const handleFormSubmit = (onSubmit: (data: T) => Promise<void> | void) => {
    return form.handleSubmit(async (data: T) => {
      try {
        setIsNavigating(true);
        await onSubmit(data);
        clearPersistence(); // Clear saved data on successful submit
      } catch (error) {
        setIsNavigating(false);
        throw error;
      }
    });
  };

  return {
    hasUnsavedChanges: hasChanges(),
    safeNavigate,
    clearPersistence,
    handleFormSubmit
  };
}
