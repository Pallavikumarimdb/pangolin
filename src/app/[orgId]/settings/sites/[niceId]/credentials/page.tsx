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
import { PickSiteDefaultsResponse } from "@server/routers/site";
import { useSiteContext } from "@app/hooks/useSiteContext";
import CopyTextBox from "@app/components/CopyTextBox";
import { QRCodeCanvas } from "qrcode.react";
import { generateKeypair } from "../wireguardConfig";

export default function CredentialsPage() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();
    const [newtId, setNewtId] = useState("");
    const [newtSecret, setNewtSecret] = useState("");
    const { site, updateSite } = useSiteContext();
    const [wgConfig, setWgConfig] = useState("");
    const [siteDefaults, setSiteDefaults] =
        useState<PickSiteDefaultsResponse | null>(null);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publicKey, setPublicKey] = useState("");
    const [privateKey, setPrivateKey] = useState("");

    const hydrateWireGuardConfig = (
        privateKey: string,
        publicKey: string,
        subnet: string,
        address: string,
        endpoint: string,
        listenPort: string
    ) => {
        const wgConfig = `[Interface]
Address = ${subnet}
ListenPort = 51820
PrivateKey = ${privateKey}

[Peer]
PublicKey = ${publicKey}
AllowedIPs = ${address.split("/")[0]}/32
Endpoint = ${endpoint}:${listenPort}
PersistentKeepalive = 5`;
        setWgConfig(wgConfig);
    };


    // Clear credentials when user leaves/reloads
    useEffect(() => {
        const clearCreds = () => {
            setNewtId("");
            setNewtSecret("");
        };
        window.addEventListener("beforeunload", clearCreds);
        return () => window.removeEventListener("beforeunload", clearCreds);
    }, []);

    const handleRegenerate = async () => {

        const generatedKeypair = generateKeypair();

        const privateKey = generatedKeypair.privateKey;
        const publicKey = generatedKeypair.publicKey;

        setPrivateKey(privateKey);
        setPublicKey(publicKey);
        try {
            setLoading(true);
            await api
                .get(`/org/${orgId}/pick-site-defaults`)
                .then((res) => {
                    if (res && res.status === 200) {
                        const data = res.data.data;

                        setSiteDefaults(data);

                        const newtId = data.newtId;
                        const newtSecret = data.newtSecret;
                        setNewtId(newtId);
                        setNewtSecret(newtSecret);

                        hydrateWireGuardConfig(
                            privateKey,
                            data.publicKey,
                            data.subnet,
                            data.address,
                            data.endpoint,
                            data.listenPort
                        );

                    }
                });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);

        let payload: any = {};

        if (site?.type === "wireguard") {
            if (!siteDefaults || !wgConfig) {
                toast({
                    variant: "destructive",
                    title: t("siteErrorCreate"),
                    description: t("siteErrorCreateKeyPair")
                });
                setLoading(false);
                return;
            }

            payload = {
                type: "wireguard",
                subnet: siteDefaults.subnet,
                exitNodeId: siteDefaults.exitNodeId,
                pubKey: publicKey
            };
        }
        if (site?.type === "newt") {
            if (!siteDefaults) {
                toast({
                    variant: "destructive",
                    title: t("siteErrorCreate"),
                    description: t("siteErrorCreateDefaults")
                });
                setLoading(false);
                return;
            }

            payload = {
                type: "newt",
                newtId: siteDefaults?.newtId,
                newtSecret: siteDefaults?.newtSecret
            };
        }

        try {
            await api.post(`/site/${site?.siteId}/regenerate-secret`, payload);

            toast({
                title: t("credentialsSaved"),
                description: t("credentialsSavedDescription")
            });

            router.refresh();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("credentialsSaveError"),
                description: formatAxiosError(
                    e,
                    t("credentialsSaveErrorDescription")
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
                        {t("regenerateCredentials")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    {!siteDefaults ? (
                        <Button
                            onClick={handleRegenerate}
                            loading={loading}
                            disabled={site.type === "local"}
                        >
                            {t("regeneratecredentials")}
                        </Button>
                    ) : (
                        <>
                            {site.type === "wireguard" && (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("WgConfiguration")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("WgConfigurationDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <div className="flex items-center gap-4">
                                            <CopyTextBox text={wgConfig} />
                                            <div
                                                className={`relative w-fit border rounded-md`}
                                            >
                                                <div className="bg-white p-6 rounded-md">
                                                    <QRCodeCanvas
                                                        value={wgConfig}
                                                        size={168}
                                                        className="mx-auto"
                                                    />
                                                </div>
                                            </div>
                                        </div>
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
                            )}
                            {site.type === "newt" && (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("siteNewtCredentials")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t(
                                                "siteNewtCredentialsDescription"
                                            )}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <InfoSections cols={3}>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    {t("newtEndpoint")}
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
                                                    {t("newtId")}
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={newtId}
                                                    />
                                                </InfoSectionContent>
                                            </InfoSection>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    {t("newtSecretKey")}
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={newtSecret}
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
                            )}

                            <div className="flex justify-end mt-6 space-x-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setNewtId("");
                                        setNewtSecret("");
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
