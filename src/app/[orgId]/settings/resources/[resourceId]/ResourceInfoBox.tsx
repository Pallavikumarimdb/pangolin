"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InfoIcon, ShieldCheck, ShieldOff } from "lucide-react";
import { useResourceContext } from "@app/hooks/useResourceContext";
import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { internal } from "@/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useDockerSocket } from "@app/hooks/useDockerSocket";
import { useTranslations } from "next-intl";
import { AxiosResponse } from "axios";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { createApiClient } from "@app/lib/api";
import { build } from "@server/build";


type ResourceInfoBoxType = {
    orgs: ResponseOrg[];
};

type ResponseOrg = {
    orgId: string;
    name: string;
};



export default function ResourceInfoBox({ orgs }: ResourceInfoBoxType) {
    const { resource, authInfo, site } = useResourceContext();
    const api = createApiClient(useEnvContext());

    const { isEnabled, isAvailable } = useDockerSocket(site!);
    const t = useTranslations();

    let fullUrl = `${resource.ssl ? "https" : "http"}://${resource.fullDomain}`;

    const [selectedOrg, setSelectedOrg] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);

    const handleMove = async () => {
        if (!selectedOrg) return;

        try {
            setIsLoading(true);

            const res = await api.post(
                `/resource/${resource.resourceId}/move-org`,
                { orgId: selectedOrg },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (res.status !== 200) {
                throw new Error("Failed to move resource");
            }

            alert("Resource moved successfully! Redirecting to the new organization...");

            window.location.href = `/${selectedOrg}/settings/resources`;
        } catch (err) {
            console.error("Failed to move resource", err);
            alert("Error moving resource. Please check if you have permission to move resources to the selected organization.");
        } finally {
            setIsLoading(false);
        }
    };



    return (
        <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertTitle className="font-semibold">
                {t("resourceInfo")}
            </AlertTitle>
            <AlertDescription className="mt-4">
                <InfoSections cols={5}>
                    {resource.http ? (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("authentication")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    {authInfo.password ||
                                        authInfo.pincode ||
                                        authInfo.sso ||
                                        authInfo.whitelist ? (
                                        <div className="flex items-start space-x-2 text-green-500">
                                            <ShieldCheck className="w-4 h-4 mt-0.5" />
                                            <span>{t("protected")}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center space-x-2 text-yellow-500">
                                            <ShieldOff className="w-4 h-4" />
                                            <span>{t("notProtected")}</span>
                                        </div>
                                    )}
                                </InfoSectionContent>
                            </InfoSection>
                            <InfoSection>
                                <InfoSectionTitle>URL</InfoSectionTitle>
                                <InfoSectionContent>
                                    <CopyToClipboard
                                        text={fullUrl}
                                        isLink={true}
                                    />
                                </InfoSectionContent>
                            </InfoSection>
                            <InfoSection>
                                <InfoSectionTitle>{t("site")}</InfoSectionTitle>
                                <InfoSectionContent>
                                    {resource.siteName}
                                </InfoSectionContent>
                            </InfoSection>
                            {/* {isEnabled && (
                                <InfoSection>
                                    <InfoSectionTitle>Socket</InfoSectionTitle>
                                    <InfoSectionContent>
                                        {isAvailable ? (
                                            <span className="text-green-500 flex items-center space-x-2">
                                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                <span>Online</span>
                                            </span>
                                        ) : (
                                            <span className="text-neutral-500 flex items-center space-x-2">
                                                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                                <span>Offline</span>
                                            </span>
                                        )}
                                    </InfoSectionContent>
                                </InfoSection>
                            )} */}
                        </>
                    ) : (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("protocol")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    <span>
                                        {resource.protocol.toUpperCase()}
                                    </span>
                                </InfoSectionContent>
                            </InfoSection>
                            <InfoSection>
                                <InfoSectionTitle>{t("port")}</InfoSectionTitle>
                                <InfoSectionContent>
                                    <CopyToClipboard
                                        text={resource.proxyPort!.toString()}
                                        isLink={false}
                                    />
                                </InfoSectionContent>
                            </InfoSection>
                            {build == "oss" && (
                                <InfoSection>
                                    <InfoSectionTitle>
                                        {t("externalProxyEnabled")}
                                    </InfoSectionTitle>
                                    <InfoSectionContent>
                                        <span>
                                            {resource.enableProxy
                                                ? t("enabled")
                                                : t("disabled")}
                                        </span>
                                    </InfoSectionContent>
                                </InfoSection>
                            )}
                        </>
                    )}
                    <InfoSection>
                        <InfoSectionTitle>{t("visibility")}</InfoSectionTitle>
                        <InfoSectionContent>
                            <span>
                                {resource.enabled
                                    ? t("enabled")
                                    : t("disabled")}
                            </span>
                        </InfoSectionContent>
                    </InfoSection>

                    <InfoSection>
                        <InfoSectionContent>
                            <div className="flex flex-col gap-2">
                                <Select onValueChange={setSelectedOrg}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue
                                            placeholder={
                                                orgs.length === 0
                                                    ? "No sites available"
                                                    : "Select target site"
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {orgs.map((org) => (
                                            <SelectItem key={org.orgId} value={org.orgId}>
                                                {org.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Button
                                    size="sm"
                                    onClick={handleMove}
                                    disabled={!selectedOrg || isLoading}
                                    variant="default"
                                >
                                    {isLoading ? (
                                        <>
                                            <RotateCw className="w-4 h-4 animate-spin mr-2" />
                                            Moving...
                                        </>
                                    ) : (
                                        "Move Resource"
                                    )}
                                </Button>
                            </div>
                        </InfoSectionContent>
                    </InfoSection>
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}