import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean;
  message?: string;
}

export function useUnsavedChanges({ 
  hasUnsavedChanges, 
  message = "You have unsaved changes. Are you sure you want to leave?" 
}: UseUnsavedChangesOptions) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Handle browser beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !isNavigating) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message, isNavigating]);

  // create a safe navigation function
  const safeNavigate = useCallback((url: string) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(message);
      if (confirmed) {
        setIsNavigating(true);
        router.push(url);
      }
    } else {
      router.push(url);
    }
  }, [hasUnsavedChanges, message, router]);

  return { safeNavigate, setIsNavigating };
}