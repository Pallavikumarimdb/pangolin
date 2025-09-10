'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AxiosResponse } from 'axios';
import { toUnicode } from 'punycode';
import { createApiClient } from '@app/lib/api';
import { useEnvContext } from '@app/hooks/useEnvContext';
import { useTranslations } from 'next-intl';
import { formatAxiosError } from '@app/lib/api';
import { toast } from '@app/hooks/useToast';
import SiteResourcesDirectoryTree from './SiteResources';
import ConfirmDeleteDialog from '@app/components/ConfirmDeleteDialog';
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionDescription,
    SettingsSectionBody,
} from '@app/components/Settings';
import { useSiteContext } from '@app/hooks/useSiteContext';


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

type SiteData = {
    siteId: number;
    name: string;
    niceId: string;
    resources: SiteResourceRow[];
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

export default function AllSiteResourcesPage() {
    const t = useTranslations();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const params = useParams<{ orgId: string }>();
    const { site } = useSiteContext();
    const orgId = params.orgId;

    const [sites, setSites] = useState<SiteData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedResource, setSelectedResource] = useState<SiteResourceRow | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [resources, setResources] = useState<SiteResourceRow[]>([]);

    useEffect(() => {
        if (!orgId) {
            console.error("Org ID not found in params");
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
                if (res.status === 200) {
                    setLoading(false);
                }

                setResources(mapped);
            } catch (e) {
                console.error("Failed to fetch site proxy resources:", e);
            }
        };

        fetchResources();
    }, [api, params.orgId, site]);

    const deleteResource = async (resourceId: number) => {
        try {
            await api.delete(`/resource/${resourceId}`);

            setSites(prevSites =>
                prevSites.map(site => ({
                    ...site,
                    resources: site.resources.filter(r => r.id !== resourceId)
                }))
            );

            toast({
                title: t("resourceDeleted"),
                description: t("resourceDeletedDescription")
            });

            setIsDeleteModalOpen(false);
            setSelectedResource(null);
        } catch (e) {
            console.error(t("resourceErrorDelte"), e);
            toast({
                variant: "destructive",
                title: t("resourceErrorDelte"),
                description: formatAxiosError(e, t("resourceErrorDelte"))
            });
        }
    };

    const toggleResourceEnabled = async (val: boolean, resourceId: number) => {
        try {
            await api.post(`resource/${resourceId}`, {
                enabled: val
            });

            setSites(prevSites =>
                prevSites.map(site => ({
                    ...site,
                    resources: site.resources.map(resource =>
                        resource.id === resourceId
                            ? { ...resource, enabled: val }
                            : resource
                    )
                }))
            );

            toast({
                title: val ? t("resourceEnabled") : t("resourceDisabled"),
                description: t("resourceUpdatedSuccessfully")
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("resourcesErrorUpdate"),
                description: formatAxiosError(e, t("resourcesErrorUpdateDescription"))
            });
        }
    };

    const handleDeleteResource = (resourceId: number) => {
        const resource = sites
            .flatMap(site => site.resources)
            .find(r => r.id === resourceId);

        if (resource) {
            setSelectedResource(resource);
            setIsDeleteModalOpen(true);
        }
    };

    if (loading) {
        return (
            <SettingsContainer>
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionDescription>
                            Loading all resources across your sites...
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>
                    <SettingsSectionBody>
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    </SettingsSectionBody>
                </SettingsSection>
            </SettingsContainer>
        );
    }

    return (
        <>
            {selectedResource && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedResource(null);
                    }}
                    dialog={
                        <div>
                            <p className="mb-2">
                                {t("resourceQuestionRemove", {
                                    selectedResource: selectedResource?.name || selectedResource?.id
                                })}
                            </p>
                            <p className="mb-2">{t("resourceMessageRemove")}</p>
                            <p>{t("resourceMessageConfirm")}</p>
                        </div>
                    }
                    buttonText={t("resourceDeleteConfirm")}
                    onConfirm={async () => deleteResource(selectedResource!.id)}
                    string={selectedResource.name}
                    title={t("resourceDelete")}
                />
            )}

            <SettingsContainer>
                <SettingsSection>
                    <SettingsSectionBody>
                        <SiteResourcesDirectoryTree
                            site={site}
                            resources={resources}
                            orgId={orgId}
                            onToggleResourceEnabled={toggleResourceEnabled}
                            onDeleteResource={handleDeleteResource}
                            t={t}
                        />
                    </SettingsSectionBody>
                </SettingsSection>
            </SettingsContainer>
        </>
    );
}