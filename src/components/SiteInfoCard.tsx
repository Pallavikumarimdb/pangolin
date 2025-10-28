"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { useSiteContext } from "@app/hooks/useSiteContext";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useTranslations } from "next-intl";
import { useEnvContext } from "@app/hooks/useEnvContext";

type SiteInfoCardProps = {};

export default function SiteInfoCard({ }: SiteInfoCardProps) {
    const { site, updateSite } = useSiteContext();
    const t = useTranslations();
    const { env } = useEnvContext();

    const getConnectionTypeString = (type: string) => {
        if (type === "newt") {
            return "Newt";
        } else if (type === "wireguard") {
            return "WireGuard";
        } else if (type === "local") {
            return t("local");
        } else {
            return t("unknown");
        }
    };

    return (
        <Alert>
            <AlertDescription>
                <InfoSections cols={env.flags.enableClients ? 4 : 3}>
                    <InfoSection>
                        <InfoSectionTitle>
                            {t("niceId")}
                        </InfoSectionTitle>
                        <InfoSectionContent>
                            {site.niceId}
                        </InfoSectionContent>
                    </InfoSection>
                    {(site.type == "newt" || site.type == "wireguard") && (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("status")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    {site.online ? (
                                        <div className="text-green-500 flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span>{t("online")}</span>
                                        </div>
                                    ) : (
                                        <div className="text-neutral-500 flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                            <span>{t("offline")}</span>
                                        </div>
                                    )}
                                </InfoSectionContent>
                            </InfoSection>
                        </>
                    )}
                    <InfoSection>
                        <InfoSectionTitle>
                            {t("connectionType")}
                        </InfoSectionTitle>
                        <InfoSectionContent>
                            {getConnectionTypeString(site.type)}
                        </InfoSectionContent>
                    </InfoSection>

                    {env.flags.enableClients && site.type == "newt" && (
                        <InfoSection>
                            <InfoSectionTitle>Address</InfoSectionTitle>
                            <InfoSectionContent>
                                {site.address?.split("/")[0]}
                            </InfoSectionContent>
                        </InfoSection>
                    )}
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}
