"use client";

import Link from "next/link";
import { NavigationGuard } from "@/utils/navigationGuard";
import { useRouter } from "next/navigation";

interface EnhancedLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  replace?: boolean;
}

export function EnhancedLink({ href, children, className, replace = false }: EnhancedLinkProps) {
  const router = useRouter();
  const navigationGuard = NavigationGuard.getInstance();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (navigationGuard.getHasUnsavedChanges()) {
      const confirmed = navigationGuard.confirmNavigation();
      if (confirmed) {
        navigationGuard.clearUnsavedChanges();
        if (replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      }
    } else {
      if (replace) {
        router.replace(href);
      } else {
        router.push(href);
      }
    }
  };

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}