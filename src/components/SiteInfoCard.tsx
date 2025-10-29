"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, InfoIcon, Pencil, X } from "lucide-react";
import { useSiteContext } from "@app/hooks/useSiteContext";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useTranslations } from "next-intl";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useState } from "react";
import { useToast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useRouter, usePathname } from "next/navigation";

type SiteInfoCardProps = {};

export default function SiteInfoCard({ }: SiteInfoCardProps) {
    const { site, updateSite } = useSiteContext();
    const t = useTranslations();
    const { env } = useEnvContext();
    const api = createApiClient(useEnvContext());
    const router = useRouter();
    const pathname = usePathname();

    const [isEditing, setIsEditing] = useState(false);
    const [niceId, setNiceId] = useState(site.niceId);
    const [tempNiceId, setTempNiceId] = useState(site.niceId);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

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
            const response = await api.post(`/site/${site.siteId}`, {
                niceId: tempNiceId.trim()
            });

            setNiceId(tempNiceId.trim());
            setIsEditing(false);

            updateSite({
                niceId: tempNiceId.trim()
            });

            // update the URL to reflect the new niceId
            const newPath = pathname.replace(`/sites/${niceId}`, `/sites/${tempNiceId.trim()}`);
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
                <InfoSections cols={env.flags.enableClients ? 4 : 3}>
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
