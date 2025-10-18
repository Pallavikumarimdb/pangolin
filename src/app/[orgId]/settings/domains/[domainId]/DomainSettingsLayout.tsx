"use client";

import { useState } from "react";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@app/components/ui/button";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import DomainInfoCard from "@app/components/DomainInfoCard";
import DomainProvider from "@app/providers/DomainProvider";
import { useTranslations } from "next-intl";


interface DomainSettingsLayoutProps {
  orgId: string;
  domain: any,
  children: React.ReactNode;
}

export default function DomainSettingsLayout({ orgId, domain, children }: DomainSettingsLayoutProps) {
  const router = useRouter();
  const api = createApiClient(useEnvContext());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [restartingDomains, setRestartingDomains] = useState<Set<string>>(new Set());
  const t = useTranslations();
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      router.refresh();
    } catch {
      toast({
        title: t("error"),
        description: t("refreshError"),
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const restartDomain = async (domainId: string) => {
    setRestartingDomains((prev) => new Set(prev).add(domainId));
    try {
      await api.post(`/org/${orgId}/domain/${domainId}/restart`);
      toast({
        title: t("success"),
        description: t("domainRestartedDescription", {
          fallback: "Domain verification restarted successfully",
        }),
      });
      refreshData();
    } catch (e) {
      toast({
        title: t("error"),
        description: formatAxiosError(e),
        variant: "destructive",
      });
    } finally {
      setRestartingDomains((prev) => {
        const newSet = new Set(prev);
        newSet.delete(domainId);
        return newSet;
      });
    }
  };

  const isRestarting = restartingDomains.has(domain.domainId);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <SettingsSectionTitle
          title={domain ? domain.baseDomain : t("domainSetting")}
          description={t("domainSettingDescription")}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => restartDomain(domain.domainId)}
          disabled={isRestarting}
        >
          {isRestarting ? (
            <>
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              {t("restarting", { fallback: "Restarting..." })}
            </>
          ) : (
            <>
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              {t("restart", { fallback: "Restart" })}
            </>
          )}
        </Button>
      </div>

      <DomainProvider domain={domain}>
        <div className="space-y-6">
          <DomainInfoCard orgId={orgId} domainId={domain.domainId} />
        </div>
        {children}
      </DomainProvider>
    </>
  );
}
