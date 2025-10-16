"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useTranslations } from "next-intl";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useDomainContext } from "@app/hooks/useDomainContext";

type DomainInfoCardProps = {};

export default function DomainInfoCard({ }: DomainInfoCardProps) {
    const { domain, updateDomain } = useDomainContext();
    const t = useTranslations();
    const { env } = useEnvContext();


    return (
        <Alert>
            <AlertDescription>
                <InfoSections cols={env.flags.enableClients ? 3 : 2}>
                    <InfoSection>
                        <InfoSectionTitle>
                            {t("type")}
                        </InfoSectionTitle>
                        <InfoSectionContent>
                            <span>
                                {domain.type}
                            </span>
                        </InfoSectionContent>
                    </InfoSection>
                    <InfoSection>
                        <InfoSectionTitle>
                            {t("status")}
                        </InfoSectionTitle>
                        <InfoSectionContent>
                            {domain.verified ? (
                                <div className="text-green-500 flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span>{t("verified")}</span>
                                </div>
                            ) : (   
                                <div className="text-neutral-500 flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                    <span>{t("unverified")}</span>
                                </div>
                            )}
                        </InfoSectionContent>
                    </InfoSection>
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}
