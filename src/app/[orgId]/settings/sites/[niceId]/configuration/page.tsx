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
import ConfirmDeleteDialog from '@app/components/ConfirmDeleteDialog';
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionDescription,
    SettingsSectionBody,
} from '@app/components/Settings';
import { useSiteContext } from '@app/hooks/useSiteContext';
import { ListSiteResourcesResponse, ListSiteTargetsResponse, SiteResourceRow, SiteTargetRow } from './siteConfigComponents/siteConfigTypes';
import SiteConfigDirectoryTree from './siteConfigComponents/siteConfigurations';


export default function AllSiteResourcesPage() {
    const t = useTranslations();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const params = useParams<{ orgId: string }>();
    const { site } = useSiteContext();
    const orgId = params.orgId;

    const [loading, setLoading] = useState(true);
    const [selectedResource, setSelectedResource] = useState<SiteResourceRow | null>(null);
    const [isDeleteResourceModalOpen, setIsDeleteResourceModalOpen] = useState(false);
    const [resources, setResources] = useState<SiteResourceRow[]>([]);
    const [targets, setTargets] = useState<SiteTargetRow[]>([]);

    useEffect(() => {
        if (!orgId) {
            console.error("Org ID not found in params");
            return;
        }

        const fetchData = async () => {
            try {
                const resourcesRes = await api.get<AxiosResponse<ListSiteResourcesResponse>>(
                    `/org/${orgId}/site/${site.siteId}/proxy-resources`
                );

                const siteProxyResources = resourcesRes.data.data.resources;

                const mappedResources: SiteResourceRow[] = siteProxyResources.map((resource) => ({
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
                }));

                const targetsRes = await api.get<AxiosResponse<ListSiteTargetsResponse>>(
                    `/org/${orgId}/site/${site.siteId}/targets`
                );

                const siteTargets = targetsRes.data.data.targets;

                const mappedTargets: SiteTargetRow[] = siteTargets.map((target) => ({
                    id: target.targetId,
                    resourceId: target.resourceId,
                    siteId: target.siteId,
                    ip: target.ip,
                    method: target.method,
                    port: target.port,
                    internalPort: target.internalPort,
                    enabled: target.enabled,
                    resourceName: target.resourceName,
                    resourceNiceId: target.resourceNiceId,
                    protocol: target.protocol,
                }));

                if (resourcesRes.status === 200 && targetsRes.status === 200) {
                    setLoading(false);
                }

                setResources(mappedResources);
                setTargets(mappedTargets);
            } catch (e) {
                console.error("Failed to fetch site data:", e);
                setLoading(false);
            }
        };

        fetchData();
    }, [api, params.orgId, site]);

    const deleteResource = async (resourceId: number) => {
        try {
            await api.delete(`/resource/${resourceId}`);

            setResources(prevResources => 
                prevResources.filter(r => r.id !== resourceId)
            );

            // Also remove any targets that belonged to this resource
            setTargets(prevTargets =>
                prevTargets.filter(t => t.resourceId !== resourceId)
            );

            toast({
                title: t("resourceDeleted"),
                description: t("resourceDeletedDescription")
            });

            setIsDeleteResourceModalOpen(false);
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

            setResources(prevResources =>
                prevResources.map(resource =>
                    resource.id === resourceId
                        ? { ...resource, enabled: val }
                        : resource
                )
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
        const resource = resources.find(r => r.id === resourceId);
        if (resource) {
            setSelectedResource(resource);
            setIsDeleteResourceModalOpen(true);
        }
    };


    if (loading) {
        return (
            <SettingsContainer>
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionDescription>
                            Loading resources and targets for your site...
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
                    open={isDeleteResourceModalOpen}
                    setOpen={(val) => {
                        setIsDeleteResourceModalOpen(val);
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
                        <SiteConfigDirectoryTree
                            site={site}
                            resources={resources}
                            targets={targets}
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