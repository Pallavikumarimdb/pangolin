"use client";

import { useEffect, useState } from "react";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { Button } from "@app/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InfoSection, InfoSectionContent, InfoSections, InfoSectionTitle } from "@app/components/InfoSection";
import CopyToClipboard from "@app/components/CopyToClipboard";
import { PickClientDefaultsResponse } from "@server/routers/client";
import { useClientContext } from "@app/hooks/useClientContext";

export default function GeneralPage() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();
    const [olmId, setOlmId] = useState("");
    const [olmSecret, setOlmSecret] = useState("");
    const { client, updateClient } = useClientContext();

    const [clientDefaults, setClientDefaults] =
        useState<PickClientDefaultsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Clear credentials when user leaves/reloads
    useEffect(() => {
        const clearCreds = () => {
            setOlmId("");
            setOlmSecret("");
        };
        window.addEventListener("beforeunload", clearCreds);
        return () => window.removeEventListener("beforeunload", clearCreds);
    }, []);

    const handleRegenerate = async () => {
        try {
            setLoading(true);
            await api
                .get(`/org/${orgId}/pick-client-defaults`)
                .then((res) => {
                    if (res && res.status === 200) {
                        const data = res.data.data;

                        setClientDefaults(data);

                        const olmId = data.olmId;
                        const olmSecret = data.olmSecret;
                        setOlmId(olmId);
                        setOlmSecret(olmSecret);

                    }
                });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);

        try {
            await api.post(`/client/${client?.clientId}`, {
                olmId: clientDefaults?.olmId,
                secret: clientDefaults?.olmSecret,
            });

            toast({
                title: t("clientUpdated"),
                description: t("clientUpdatedDescription")
            });

            router.refresh();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("clientUpdateFailed"),
                description: formatAxiosError(
                    e,
                    t("clientUpdateError")
                )
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("generatedcredentials")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("regenerateClientCredentials")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    {!clientDefaults ? (
                        <Button
                            onClick={handleRegenerate}
                            loading={loading}
                            disabled={loading}
                        >
                            {t("regeneratecredentials")}
                        </Button>
                    ) : (
                        <>
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t("clientOlmCredentials")}
                                    </SettingsSectionTitle>
                                    <SettingsSectionDescription>
                                        {t("clientOlmCredentialsDescription")}
                                    </SettingsSectionDescription>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <InfoSections cols={3}>
                                        <InfoSection>
                                            <InfoSectionTitle>
                                                {t("olmEndpoint")}
                                            </InfoSectionTitle>
                                            <InfoSectionContent>
                                                <CopyToClipboard
                                                    text={
                                                        env.app.dashboardUrl
                                                    }
                                                />
                                            </InfoSectionContent>
                                        </InfoSection>
                                        <InfoSection>
                                            <InfoSectionTitle>
                                                {t("olmId")}
                                            </InfoSectionTitle>
                                            <InfoSectionContent>
                                                <CopyToClipboard
                                                    text={olmId}
                                                />
                                            </InfoSectionContent>
                                        </InfoSection>
                                        <InfoSection>
                                            <InfoSectionTitle>
                                                {t("olmSecretKey")}
                                            </InfoSectionTitle>
                                            <InfoSectionContent>
                                                <CopyToClipboard
                                                    text={olmSecret}
                                                />
                                            </InfoSectionContent>
                                        </InfoSection>
                                    </InfoSections>

                                    <Alert variant="neutral" className="mt-4">
                                        <InfoIcon className="h-4 w-4" />
                                        <AlertTitle className="font-semibold">
                                            {t("copyandsavethesecredentials")}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {t(
                                                "copyandsavethesecredentialsdescription"
                                            )}
                                        </AlertDescription>
                                    </Alert>
                                </SettingsSectionBody>
                            </SettingsSection>

                            <div className="flex justify-end mt-6 space-x-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setOlmId("");
                                        setOlmSecret("");
                                    }}
                                >
                                    {t("cancel")}
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    loading={saving}
                                    disabled={saving}
                                >
                                    {t("savecredentials")}
                                </Button>
                            </div>
                        </>
                    )}
                </SettingsSectionBody>
            </SettingsSection>
        </SettingsContainer>
    );
}
