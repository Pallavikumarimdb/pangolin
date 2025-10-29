"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, InfoIcon, Pencil, ShieldCheck, ShieldOff, X } from "lucide-react";
import { useResourceContext } from "@app/hooks/useResourceContext";
import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useTranslations } from "next-intl";
import CertificateStatus from "@app/components/private/CertificateStatus";
import { toUnicode } from "punycode";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useState } from "react";
import { useToast } from "@app/hooks/useToast";
import { UpdateResourceResponse } from "@server/routers/resource";
import { AxiosResponse } from "axios";
import { useRouter, usePathname } from "next/navigation";

type ResourceInfoBoxType = {};

export default function ResourceInfoBox({ }: ResourceInfoBoxType) {
    const { resource, authInfo, updateResource } = useResourceContext();
    const { env } = useEnvContext();
    const api = createApiClient(useEnvContext());
    const router = useRouter();
    const pathname = usePathname();

    const [isEditing, setIsEditing] = useState(false);
    const [niceId, setNiceId] = useState(resource.niceId);
    const [tempNiceId, setTempNiceId] = useState(resource.niceId);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const t = useTranslations();

    const fullUrl = `${resource.ssl ? "https" : "http"}://${toUnicode(resource.fullDomain || "")}`;


    const handleEdit = () => {
        setTempNiceId(niceId);
        setIsEditing(true);
    };

    const handleCancel = () => {
        setTempNiceId(niceId);
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (tempNiceId.trim() === "") {
            toast({
                variant: "destructive",
                title: t("error"),
                description: t("niceIdCannotBeEmpty")
            });
            return;
        }

        if (tempNiceId === niceId) {
            setIsEditing(false);
            return;
        }

        setIsLoading(true);

        try {
            const res = await api
                .post<AxiosResponse<UpdateResourceResponse>>(
                    `resource/${resource?.resourceId}`,
                    {
                        niceId: tempNiceId.trim()
                    }
                );

            setNiceId(tempNiceId.trim());
            setIsEditing(false);

            updateResource({
                niceId: tempNiceId.trim()
            });

            // update the URL to reflect the new niceId
            const newPath = pathname.replace(`/resources/${niceId}`, `/resources/${tempNiceId.trim()}`);
            router.replace(newPath);

            toast({
                title: t("niceIdUpdated"),
                description: t("niceIdUpdatedSuccessfully")
            });
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: t("niceIdUpdateError"),
                description: formatAxiosError(
                    e,
                    t("niceIdUpdateErrorDescription")
                )
            });
        } finally {
            setIsLoading(false);
        }
    };


    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSave();
        } else if (e.key === "Escape") {
            handleCancel();
        }
    };

    return (
        <Alert>
            <AlertDescription>
                {/* 4 cols because of the certs */}
                <InfoSections
                    cols={resource.http && env.flags.usePangolinDns ? 5 : 4}
                >
                    <InfoSection>
                        <InfoSectionTitle>
                            {t("niceId")}
                        </InfoSectionTitle>
                        <InfoSectionContent>
                            <div className="flex items-center gap-2">
                                {isEditing ? (
                                    <>
                                        <Input
                                            value={tempNiceId}
                                            onChange={(e) => setTempNiceId(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            disabled={isLoading}
                                            className="flex-1"
                                            autoFocus
                                        />
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={handleSave}
                                            disabled={isLoading}
                                            className="h-8 w-8"
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={handleCancel}
                                            disabled={isLoading}
                                            className="h-8 w-8"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <span>{niceId}</span>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={handleEdit}
                                            className="h-8 w-8"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </InfoSectionContent>
                    </InfoSection>
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
                                        authInfo.whitelist ||
                                        authInfo.headerAuth ? (
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
                            {/* {build == "oss" && (
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
                            )} */}
                        </>
                    )}
                    {/* <InfoSection> */}
                    {/*     <InfoSectionTitle>{t('visibility')}</InfoSectionTitle> */}
                    {/*     <InfoSectionContent> */}
                    {/*         <span> */}
                    {/*             {resource.enabled ? t('enabled') : t('disabled')} */}
                    {/*         </span> */}
                    {/*     </InfoSectionContent> */}
                    {/* </InfoSection> */}
                    {/* Certificate Status Column */}
                    {resource.http &&
                        resource.domainId &&
                        resource.fullDomain &&
                        env.flags.usePangolinDns && (
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("certificateStatus", {
                                        defaultValue: "Certificate"
                                    })}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    <CertificateStatus
                                        orgId={resource.orgId}
                                        domainId={resource.domainId}
                                        fullDomain={resource.fullDomain}
                                        autoFetch={true}
                                        showLabel={false}
                                        polling={true}
                                    />
                                </InfoSectionContent>
                            </InfoSection>
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
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}
