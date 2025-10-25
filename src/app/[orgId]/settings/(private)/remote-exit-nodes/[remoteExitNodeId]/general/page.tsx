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
import CopyTextBox from "@app/components/CopyTextBox";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { useParams, useRouter } from "next/navigation";
import { AxiosResponse } from "axios";
import { useTranslations } from "next-intl";
import {
    PickRemoteExitNodeDefaultsResponse,
    QuickStartRemoteExitNodeResponse
} from "@server/routers/remoteExitNode/types";
import { useRemoteExitNodeContext } from "@app/hooks/useRemoteExitNodeContext";

export default function GeneralPage() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();
    const { remoteExitNode, updateRemoteExitNode } = useRemoteExitNodeContext();

    const [credentials, setCredentials] =
        useState<PickRemoteExitNodeDefaultsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Clear credentials when user leaves/reloads
    useEffect(() => {
        const clearCreds = () => setCredentials(null);
        window.addEventListener("beforeunload", clearCreds);
        return () => window.removeEventListener("beforeunload", clearCreds);
    }, []);

    const handleRegenerate = async () => {
        try {
            setLoading(true);
            const response = await api.get<
                AxiosResponse<PickRemoteExitNodeDefaultsResponse>
            >(`/org/${orgId}/pick-remote-exit-node-defaults`);

            setCredentials(response.data.data);
            toast({
                title: t("success"),
                description: t("Credentials generated successfully."),
            });
        } catch (error) {
            toast({
                title: t("error"),
                description: formatAxiosError(
                    error,
                    t("Failed to generate credentials")
                ),
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!credentials) return;

        try {
            setSaving(true);

            const response = await api.put<
                AxiosResponse<QuickStartRemoteExitNodeResponse>
            >(`/org/${orgId}/update-remote-exit-node`, {
                remoteExitNodeId: remoteExitNode.remoteExitNodeId,
                secret: credentials.secret,
            });

            toast({
                title: t("success"),
                description: t("Credentials saved successfully."),
            });

            // For security, clear them from UI
            setCredentials(null);

        } catch (error) {
            toast({
                title: t("error"),
                description: formatAxiosError(
                    error,
                    t("Failed to save credentials")
                ),
                variant: "destructive",
            });
        } finally {
            setSaving(false);
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
                    {!credentials ? (
                        <Button
                            onClick={handleRegenerate}
                            loading={loading}
                            disabled={loading}
                        >
                            {t("regeneratecredentials")}
                        </Button>
                    ) : (
                        <>
                            <CopyTextBox
                                text={`managed:
  id: "${remoteExitNode.remoteExitNodeId}"
  secret: "${credentials.secret}"`}
                            />

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

                            <div className="flex justify-end mt-6 space-x-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setCredentials(null)}
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
