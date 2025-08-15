import { useEffect, useState } from 'react';
import { NavigationGuard } from '@/utils/navigationGuard';

interface UseTabNavigationProps {
  hasUnsavedChanges: boolean;
  warningMessage?: string;
}

export function useTabNavigation({ hasUnsavedChanges, warningMessage }: UseTabNavigationProps) {
  const [currentTab, setCurrentTab] = useState<string>('');

  useEffect(() => {
    const navigationGuard = NavigationGuard.getInstance();
    navigationGuard.setUnsavedChanges(hasUnsavedChanges, warningMessage);
  }, [hasUnsavedChanges, warningMessage]);

  const handleTabChange = (value: string) => {
    const navigationGuard = NavigationGuard.getInstance();
    
    if (navigationGuard.getHasUnsavedChanges()) {
      const confirmed = navigationGuard.confirmNavigation();
      if (confirmed) {
        navigationGuard.clearUnsavedChanges();
        setCurrentTab(value);
      }
    } else {
      setCurrentTab(value);
    }
  };

  return {
    currentTab,
    setCurrentTab: handleTabChange
  };
}