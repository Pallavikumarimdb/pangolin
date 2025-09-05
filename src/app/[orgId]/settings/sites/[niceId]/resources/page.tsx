'use client';

import SiteResourcesTable from "./SiteResources";
import { AxiosResponse } from "axios";
import { redirect, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toUnicode } from "punycode";
import { useSiteContext } from "@app/hooks/useSiteContext";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm
} from "@app/components/Settings";
import { useTranslations } from "next-intl";

// Define the types locally since they might not be exported from the backend
type SiteResourceRow = {
    id: number;
    name: string;
    orgId: string;
    domain: string;
    authState: string;
    http: boolean;
    protocol: string;
    proxyPort: number | null;
    enabled: boolean;
    domainId?: string;
};

type ListSiteResourcesResponse = {
    resources: Array<{
        resourceId: number;
        name: string;
        orgId: string;
        niceId: string;
        subdomain: string;
        fullDomain: string;
        domainId: string;
        ssl: boolean;
        sso: boolean;
        http: boolean;
        protocol: string;
        proxyPort: number;
        emailWhitelistEnabled: boolean;
        applyRules: boolean;
        enabled: boolean;
        enableProxy: boolean;
        skipToIdpId: number;
        targetId: number;
        ip: string;
        method: string;
        port: number;
        baseDomain: string;
    }>;
    pagination: { total: number; limit: number; offset: number };
};


export const dynamic = "force-dynamic";

export default function SiteResourcesPage() {
    const t = useTranslations();
    const { site } = useSiteContext();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const params = useParams<{ orgId: string; siteId: string }>();
    const orgId = params.orgId;

    const [resources, setResources] = useState<SiteResourceRow[]>([]);

    useEffect(() => {
        if (!site) {
            console.error("Site not found");
            redirect(`/${orgId}/settings/sites`);
            return;
        }

        if (!orgId) {
            console.error("Org ID not found in params");
            redirect(`/`);
            return;
        }

        const fetchResources = async () => {
            try {
                const res = await api.get<AxiosResponse<ListSiteResourcesResponse>>(
                    `/org/${orgId}/site/${site.siteId}/proxy-resources`
                );

                const siteProxyResources = res.data.data.resources;

                const mapped: SiteResourceRow[] = siteProxyResources.map((resource) => ({
                    id: resource.resourceId,
                    name: resource.name,
                    orgId: orgId,
                    domain: `${resource.ssl ? "https://" : "http://"}${toUnicode(resource.fullDomain || "")}`,
                    protocol: resource.protocol,
                    proxyPort: resource.proxyPort,
                    http: resource.http,
                    authState: !resource.http
                        ? "none"
                        : resource.sso ||
                            resource.skipToIdpId !== null ||
                            resource.emailWhitelistEnabled ||
                            resource.applyRules
                            ? "protected"
                            : "not_protected",
                    enabled: resource.enabled,
                    domainId: resource.domainId || undefined,
                    targetIp: resource.ip,
                    targetPort: resource.port,
                }));

                setResources(mapped);
            } catch (e) {
                console.error("Failed to fetch site proxy resources:", e);
            }
        };

        fetchResources();
    }, [api, params.orgId, site]);

    if (!site) {
        return null;
    }


    return (
        <>
            <SettingsContainer>
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            Site Resources
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            List of all resources connected to this site.
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>

                    <SettingsSectionBody>
                        <SiteResourcesTable
                            resources={resources}
                            orgId={orgId}
                            siteId={site.siteId}
                            siteNiceId={site.niceId}
                        />

                    </SettingsSectionBody>
                </SettingsSection>
            </SettingsContainer>
        </>
    );
}