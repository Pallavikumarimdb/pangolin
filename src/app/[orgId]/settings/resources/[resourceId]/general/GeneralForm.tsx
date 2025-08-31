"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatAxiosError } from "@app/lib/api";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { ListSitesResponse } from "@server/routers/site";
import { useEffect, useState } from "react";
import { AxiosResponse } from "axios";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "@app/hooks/useToast";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm,
    SettingsSectionFooter
} from "@app/components/Settings";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { Label } from "@app/components/ui/label";
import { ListDomainsResponse } from "@server/routers/domain";
import { UpdateResourceResponse } from "@server/routers/resource";
import { SwitchInput } from "@app/components/SwitchInput";
import { useTranslations } from "next-intl";
import { Checkbox } from "@app/components/ui/checkbox";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import DomainPicker from "@app/components/DomainPicker";
import {
    InfoIcon,
    ShieldCheck,
    ShieldOff,
    AlertTriangle,
    Users,
    Shield,
    Check,
    ArrowRight,
    Unplug,
    RotateCw,
    Globe
} from "lucide-react";
import { build } from "@server/build";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { InfoSection, InfoSectionContent } from "@app/components/InfoSection";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@app/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@app/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@app/components/ui/select";

type ResponseOrg = {
    orgId: string;
    name: string;
};

interface GeneralFormProps {
    fetchedOrgs: ResponseOrg[];
}

type MoveImpact = {
    resourceId: number;
    resourceName: string;
    currentOrgId: string;
    currentOrgName: string;
    targetOrgId: string;
    targetOrgName: string;
    impact: {
        rolePermissions: {
            count: number;
            details: {
                roleId: number;
                roleName: string;
                roleDescription?: string;
            }[];
        };
        userPermissions: {
            count: number;
            details: {
                userId: string;
                username: string;
                email: string;
                name: string;
            }[];
        };
        targetSites: {
            count: number;
            details: {
                siteId: number;
                siteName: string;
                targetId: number;
                ip: string;
                port: number;
                willBeRemoved: boolean;
            }[];
        };
        movingUser: {
            userId: string;
            username: string;
            email: string;
            name: string;
            retainsAccess: boolean;
        } | null;
        totalImpactedPermissions: number;
        authenticationPreserved: boolean;
        movingUserRetainsAccess: boolean;
    };
};

type MoveWarning = {
    type: 'warning' | 'info' | 'danger';
    icon: React.ReactNode;
    message: string;
};

export default function GeneralForm({ fetchedOrgs }: GeneralFormProps) {
    const [formKey, setFormKey] = useState(0);
    const params = useParams();
    const { resource, updateResource } = useResourceContext();
    const { org } = useOrgContext();
    const router = useRouter();
    const t = useTranslations();
    const [editDomainOpen, setEditDomainOpen] = useState(false);

    const { env } = useEnvContext();

    const orgId = params.orgId;

    const api = createApiClient({ env });

    const [sites, setSites] = useState<ListSitesResponse["sites"]>([]);
    const [saveLoading, setSaveLoading] = useState(false);
    const [transferLoading, setTransferLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [baseDomains, setBaseDomains] = useState<
        ListDomainsResponse["domains"]
    >([]);

    const [loadingPage, setLoadingPage] = useState(true);
    const [resourceFullDomain, setResourceFullDomain] = useState(
        `${resource.ssl ? "https" : "http"}://${resource.fullDomain}`
    );
    const [selectedDomain, setSelectedDomain] = useState<{
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
    } | null>(null);

    // Move resource states
    const [selectedOrg, setSelectedOrg] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [moveImpact, setMoveImpact] = useState<MoveImpact | null>(null);

    const GeneralFormSchema = z
        .object({
            enabled: z.boolean(),
            subdomain: z.string().optional(),
            name: z.string().min(1).max(255),
            domainId: z.string().optional(),
            proxyPort: z.number().int().min(1).max(65535).optional(),
            // enableProxy: z.boolean().optional()
        })
        .refine(
            (data) => {
                // For non-HTTP resources, proxyPort should be defined
                if (!resource.http) {
                    return data.proxyPort !== undefined;
                }
                // For HTTP resources, proxyPort should be undefined
                return data.proxyPort === undefined;
            },
            {
                message: !resource.http
                    ? "Port number is required for non-HTTP resources"
                    : "Port number should not be set for HTTP resources",
                path: ["proxyPort"]
            }
        );

    type GeneralFormValues = z.infer<typeof GeneralFormSchema>;

    const form = useForm<GeneralFormValues>({
        resolver: zodResolver(GeneralFormSchema),
        defaultValues: {
            enabled: resource.enabled,
            name: resource.name,
            subdomain: resource.subdomain ? resource.subdomain : undefined,
            domainId: resource.domainId || undefined,
            proxyPort: resource.proxyPort || undefined,
            // enableProxy: resource.enableProxy || false
        },
        mode: "onChange"
    });

    useEffect(() => {
        const fetchSites = async () => {
            const res = await api.get<AxiosResponse<ListSitesResponse>>(
                `/org/${orgId}/sites/`
            );
            setSites(res.data.data.sites);
        };

        const fetchDomains = async () => {
            const res = await api
                .get<
                    AxiosResponse<ListDomainsResponse>
                >(`/org/${orgId}/domains/`)
                .catch((e) => {
                    toast({
                        variant: "destructive",
                        title: t("domainErrorFetch"),
                        description: formatAxiosError(
                            e,
                            t("domainErrorFetchDescription")
                        )
                    });
                });

            if (res?.status === 200) {
                const domains = res.data.data.domains;
                setBaseDomains(domains);
                setFormKey((key) => key + 1);
            }
        };

        const load = async () => {
            await fetchDomains();
            await fetchSites();

            setLoadingPage(false);
        };

        load();
    }, []);

    async function onSubmit(data: GeneralFormValues) {
        setSaveLoading(true);

        const res = await api
            .post<AxiosResponse<UpdateResourceResponse>>(
                `resource/${resource?.resourceId}`,
                {
                    enabled: data.enabled,
                    name: data.name,
                    subdomain: data.subdomain,
                    domainId: data.domainId,
                    proxyPort: data.proxyPort,
                    // ...(!resource.http && {
                    //     enableProxy: data.enableProxy
                    // })
                }
            )
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorUpdate"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorUpdateDescription")
                    )
                });
            });

        if (res && res.status === 200) {
            toast({
                title: t("resourceUpdated"),
                description: t("resourceUpdatedDescription")
            });

            const resourceData = res.data.data;

            updateResource({
                enabled: data.enabled,
                name: data.name,
                subdomain: data.subdomain,
                fullDomain: resourceData.fullDomain,
                proxyPort: data.proxyPort,
                // ...(!resource.http && {
                //     enableProxy: data.enableProxy
                // })
            });

            router.refresh();
        }
        setSaveLoading(false);
    }

    let orgs = fetchedOrgs.filter(
        (org: { orgId: string; name: string }) => org.orgId !== resource.orgId
    );

    const getMoveImpact = async (targetOrgId: string): Promise<MoveImpact | null> => {
        try {
            const res = await api.get(
                `/resource/${resource.resourceId}/move-impact?targetOrgId=${targetOrgId}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (res.status === 200 && res.data?.data) {
                return res.data.data;
            }

            throw new Error('Invalid response format');
        } catch (error) {
            console.error('Error fetching move impact:', error);

            // Fallback to basic impact data if API call fails
            const selectedOrgName = orgs.find(org => org.orgId === targetOrgId)?.name || '';

            return {
                resourceId: resource.resourceId,
                resourceName: resource.name,
                currentOrgId: resource.orgId,
                currentOrgName: 'Current Organization',
                targetOrgId,
                targetOrgName: selectedOrgName,
                impact: {
                    rolePermissions: { count: 0, details: [] },
                    userPermissions: { count: 0, details: [] },
                    targetSites: { count: 0, details: [] },
                    movingUser: null,
                    totalImpactedPermissions: 0,
                    authenticationPreserved: true,
                    movingUserRetainsAccess: true
                }
            };
        }
    };

    useEffect(() => {
        if (selectedOrg) {
            setMoveImpact(null);
            getMoveImpact(selectedOrg).then(impact => {
                setMoveImpact(impact);
            });
        } else {
            setMoveImpact(null);
        }
    }, [selectedOrg]);

    const handleMoveClick = () => {
        if (!selectedOrg || !moveImpact) return;
        setShowConfirmDialog(true);
    };

    const handleConfirmMove = async () => {
        if (!selectedOrg) return;

        try {
            setIsLoading(true);
            setShowConfirmDialog(false);

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

            const moveData = res.data?.data;
            if (moveData?.moveImpact) {
                toast({
                    title: "Resource moved successfully!",
                    description: (
                        <div className="space-y-1">
                            <p>Resource moved successfully!</p>
                            <p>Moved to: {moveData.targetOrgName}</p>
                            <p>Redirecting to the new organization...</p>
                        </div>
                    ),
                });

            }
            window.location.href = `/${selectedOrg}/settings/resources`;

        } catch (err) {
            console.error("Failed to move resource", err);
            toast({
                variant: "destructive",
                title: "Error moving resource",
                description: "Please check if you have permission to move resources to the selected organization."
            });
        } finally {
            setIsLoading(false);
        }
    };

    const selectedOrgName = orgs.find(org => org.orgId === selectedOrg)?.name || '';

    const generateMoveWarnings = (): MoveWarning[] => {
        const warnings: MoveWarning[] = [];

        if (!moveImpact) return warnings;

        const { impact } = moveImpact;

        if (impact.rolePermissions.count > 0) {
            warnings.push({
                type: 'warning',
                icon: <Shield className="w-4 h-4" />,
                message: `${impact.rolePermissions.count} role-based permission${impact.rolePermissions.count > 1 ? 's' : ''} will be removed`
            });
        }

        if (impact.userPermissions.count > 0) {
            warnings.push({
                type: 'warning',
                icon: <Users className="w-4 h-4" />,
                message: `${impact.userPermissions.count} user${impact.userPermissions.count > 1 ? 's' : ''} will lose access`
            });
        }

        if (impact.targetSites.count > 0) {
            warnings.push({
                type: 'warning',
                icon: <Unplug className="w-4 h-4" />,
                message: `${impact.targetSites.count} target connection${impact.targetSites.count > 1 ? 's' : ''} will be disconnected`
            });
        }

        if (impact.totalImpactedPermissions === 0 && impact.targetSites.count === 0) {
            warnings.push({
                type: 'info',
                icon: <InfoIcon className="w-4 h-4" />,
                message: 'No existing permissions or connections will be affected'
            });
        }

        if (impact.movingUser) {
            warnings.push({
                type: 'info',
                icon: <Check className="w-4 h-4" />,
                message: 'You will retain access to this resource'
            });
        }

        return warnings;
    };

    const generatePreservedItems = () => [
        'Authentication settings (passwords, pins, whitelists)',
        'Resource configuration and settings',
        'SSL certificates and domain settings',
        'Your personal access to the resource'
    ];

    const warnings = generateMoveWarnings();
    const preservedItems = generatePreservedItems();

    return (
        !loadingPage && (
            <>
                <SettingsContainer>
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("resourceGeneral")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("resourceGeneralDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>

                        <SettingsSectionBody>
                            <SettingsSectionForm>
                                <Form {...form} key={formKey}>
                                    <form
                                        onSubmit={form.handleSubmit(onSubmit)}
                                        className="space-y-4"
                                        id="general-settings-form"
                                    >
                                        <FormField
                                            control={form.control}
                                            name="enabled"
                                            render={({ field }) => (
                                                <FormItem className="col-span-2">
                                                    <div className="flex items-center space-x-2">
                                                        <FormControl>
                                                            <SwitchInput
                                                                id="enable-resource"
                                                                defaultChecked={
                                                                    resource.enabled
                                                                }
                                                                label={t(
                                                                    "resourceEnable"
                                                                )}
                                                                onCheckedChange={(
                                                                    val
                                                                ) =>
                                                                    form.setValue(
                                                                        "enabled",
                                                                        val
                                                                    )
                                                                }
                                                            />
                                                        </FormControl>
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("name")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {!resource.http && (
                                            <>
                                                <FormField
                                                    control={form.control}
                                                    name="proxyPort"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                {t(
                                                                    "resourcePortNumber"
                                                                )}
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="number"
                                                                    value={
                                                                        field.value ??
                                                                        ""
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        field.onChange(
                                                                            e
                                                                                .target
                                                                                .value
                                                                                ? parseInt(
                                                                                    e
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                                : undefined
                                                                        )
                                                                    }
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                            <FormDescription>
                                                                {t(
                                                                    "resourcePortNumberDescription"
                                                                )}
                                                            </FormDescription>
                                                        </FormItem>
                                                    )}
                                                />

                                                {/* {build == "oss" && (
                                                    <FormField
                                                        control={form.control}
                                                        name="enableProxy"
                                                        render={({ field }) => (
                                                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                                <FormControl>
                                                                    <Checkbox
                                                                        variant={
                                                                            "outlinePrimarySquare"
                                                                        }
                                                                        checked={
                                                                            field.value
                                                                        }
                                                                        onCheckedChange={
                                                                            field.onChange
                                                                        }
                                                                    />
                                                                </FormControl>
                                                                <div className="space-y-1 leading-none">
                                                                    <FormLabel>
                                                                        {t(
                                                                            "resourceEnableProxy"
                                                                        )}
                                                                    </FormLabel>
                                                                    <FormDescription>
                                                                        {t(
                                                                            "resourceEnableProxyDescription"
                                                                        )}
                                                                    </FormDescription>
                                                                </div>
                                                            </FormItem>
                                                        )}
                                                    />
                                                )} */}
                                            </>
                                        )}

                                        {resource.http && (
                                            <div className="space-y-2">
                                                <Label>
                                                    {t("resourceDomain")}
                                                </Label>
                                                <div className="border p-2 rounded-md flex items-center justify-between">
                                                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                        <Globe size="14" />
                                                        {resourceFullDomain}
                                                    </span>
                                                    <Button
                                                        variant="secondary"
                                                        type="button"
                                                        size="sm"
                                                        onClick={() =>
                                                            setEditDomainOpen(
                                                                true
                                                            )
                                                        }
                                                    >
                                                        {t(
                                                            "resourceEditDomain"
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </form>
                                </Form>
                            </SettingsSectionForm>
                        </SettingsSectionBody>

                        <SettingsSectionFooter>
                            <div className="flex flex-col-2 items-center justify-between w-full space-x-2 mt-24">

                                <InfoSection>
                                    <InfoSectionContent>
                                        <div className="flex flex-col gap-4">
                                            {/* Move Resource Section */}
                                            <div className="space-y-3">
                                                <Select onValueChange={setSelectedOrg} value={selectedOrg} disabled={orgs.length === 0}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue
                                                            placeholder={
                                                                orgs.length === 0
                                                                    ? "No other organizations"
                                                                    : "Select target organization"
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

                                                <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                                                    <DialogTrigger asChild>
                                                        <Button
                                                            size="sm"
                                                            onClick={handleMoveClick}
                                                            disabled={!selectedOrg || isLoading || !moveImpact}
                                                            variant="default"
                                                        >
                                                            {isLoading ? (
                                                                <>
                                                                    <RotateCw className="w-4 h-4 animate-spin mr-2" />
                                                                    Moving...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <ArrowRight className="w-4 h-4 mr-2" />
                                                                    Move Resource
                                                                </>
                                                            )}
                                                        </Button>
                                                    </DialogTrigger>

                                                    <DialogContent className="max-h-[85vh] overflow-y-auto p-6">
                                                        <DialogHeader>
                                                            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                                                                <ArrowRight className="w-5 h-5" />
                                                                Move Resource to {selectedOrgName}?
                                                            </DialogTitle>
                                                            <DialogDescription>
                                                                This will move <span className="font-medium">"{resource.name}"</span>
                                                                from <span className="font-medium">{moveImpact?.currentOrgName || 'current organization'}</span>
                                                                to <span className="font-medium">{moveImpact?.targetOrgName || selectedOrgName}</span>.
                                                                Please review the impact below.
                                                            </DialogDescription>
                                                        </DialogHeader>

                                                        <div className="space-y-6 mt-4">
                                                            {warnings.length > 0 && (
                                                                <Alert
                                                                    variant={
                                                                        warnings.some((w) => w.type === "danger") ? "destructive" : "default"
                                                                    }
                                                                >
                                                                    <div className="flex items-start gap-3">
                                                                        <AlertTriangle className="h-5 w-5 mt-1" />
                                                                        <div>
                                                                            <AlertTitle className="font-semibold">Impact Summary</AlertTitle>
                                                                            <AlertDescription>
                                                                                <ul className="space-y-2 mt-2">
                                                                                    {warnings.map((warning, idx) => (
                                                                                        <li key={idx} className="flex items-start gap-2">
                                                                                            <span
                                                                                                className={`
                                                                                                ${warning.type === "warning"
                                                                                                        ? "text-yellow-600"
                                                                                                        : warning.type === "danger"
                                                                                                            ? "text-red-600"
                                                                                                            : "text-blue-600"}
                                                                                            `}
                                                                                            >
                                                                                                {warning.icon}
                                                                                            </span>
                                                                                            <span className="text-sm">{warning.message}</span>
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            </AlertDescription>
                                                                        </div>
                                                                    </div>
                                                                </Alert>
                                                            )}

                                                            {moveImpact && (
                                                                <div className="rounded-lg border bg-yellow-50 border-yellow-200">
                                                                    <Accordion type="single" collapsible>
                                                                        <AccordionItem value="impact">
                                                                            <AccordionTrigger className="px-4 py-3 text-yellow-900 font-medium flex items-center gap-2">
                                                                                <AlertTriangle className="w-4 h-4" />
                                                                                Detailed Impact
                                                                            </AccordionTrigger>
                                                                            <AccordionContent className="px-4 pb-4 space-y-4">
                                                                                {moveImpact.impact.rolePermissions.count > 0 && (
                                                                                    <div>
                                                                                        <p className="text-sm font-medium text-yellow-800 mb-1">
                                                                                            Roles that will lose access (
                                                                                            {moveImpact.impact.rolePermissions.count}):
                                                                                        </p>
                                                                                        <ul className="text-sm text-yellow-700 ml-4 space-y-1">
                                                                                            {moveImpact.impact.rolePermissions.details.map(
                                                                                                (role, idx) => (
                                                                                                    <li key={idx} className="flex items-start gap-2">
                                                                                                        <span>•</span>
                                                                                                        <span>{role.roleName}</span>
                                                                                                    </li>
                                                                                                )
                                                                                            )}
                                                                                        </ul>
                                                                                    </div>
                                                                                )}

                                                                                {moveImpact.impact.targetSites.count > 0 && (
                                                                                    <div>
                                                                                        <p className="text-sm font-medium text-yellow-900 mb-1">
                                                                                            Target connections that will be disconnected (
                                                                                            {moveImpact.impact.targetSites.count}):
                                                                                        </p>
                                                                                        <ul className="text-sm text-yellow-700 ml-4 space-y-1">
                                                                                            {moveImpact.impact.targetSites.details.map((target, idx) => (
                                                                                                <li key={idx} className="flex items-start gap-2">
                                                                                                    <span>•</span>
                                                                                                    <span>
                                                                                                        {target.siteName} ({target.ip}:{target.port})
                                                                                                    </span>
                                                                                                </li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </div>
                                                                                )}
                                                                            </AccordionContent>
                                                                        </AccordionItem>
                                                                    </Accordion>
                                                                </div>
                                                            )}

                                                            {/* Preserved Items */}
                                                            <div className="bg-green-50 border border-green-200 rounded-md p-4">
                                                                <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                                                                    <Check className="w-4 h-4" />
                                                                    What will be preserved
                                                                </h4>
                                                                <ul className="text-sm space-y-1 text-green-700">
                                                                    {preservedItems.map((item, idx) => (
                                                                        <li key={idx} className="flex items-start gap-2">
                                                                            <span>•</span>
                                                                            <span>{item}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        </div>

                                                        {/* Sticky Footer */}
                                                        <DialogFooter className="sticky -bottom-6 pb-4 bg-background border-t pt-3">
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => setShowConfirmDialog(false)}
                                                                disabled={isLoading}
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                variant="default"
                                                                onClick={handleConfirmMove}
                                                                disabled={isLoading}
                                                            >
                                                                {isLoading ? (
                                                                    <>
                                                                        <RotateCw className="w-4 h-4 animate-spin mr-2" />
                                                                        Moving...
                                                                    </>
                                                                ) : (
                                                                    "Confirm Move"
                                                                )}
                                                            </Button>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        </div>
                                    </InfoSectionContent>
                                </InfoSection>
                                <Button
                                    type="submit"
                                    onClick={() => {
                                        console.log(form.getValues());
                                    }}
                                    loading={saveLoading}
                                    disabled={saveLoading}
                                    form="general-settings-form"
                                >
                                    {t("saveSettings")}
                                </Button>
                            </div>
                        </SettingsSectionFooter>
                    </SettingsSection>
                </SettingsContainer>

                <Credenza
                    open={editDomainOpen}
                    onOpenChange={(setOpen) => setEditDomainOpen(setOpen)}
                >
                    <CredenzaContent>
                        <CredenzaHeader>
                            <CredenzaTitle>Edit Domain</CredenzaTitle>
                            <CredenzaDescription>
                                Select a domain for your resource
                            </CredenzaDescription>
                        </CredenzaHeader>
                        <CredenzaBody>
                            <DomainPicker
                                orgId={orgId as string}
                                cols={1}
                                onDomainChange={(res) => {
                                    const selected = {
                                        domainId: res.domainId,
                                        subdomain: res.subdomain,
                                        fullDomain: res.fullDomain,
                                        baseDomain: res.baseDomain
                                    };
                                    setSelectedDomain(selected);
                                }}
                            />
                        </CredenzaBody>
                        <CredenzaFooter>
                            <CredenzaClose asChild>
                                <Button variant="outline">{t("cancel")}</Button>
                            </CredenzaClose>
                            <Button
                                onClick={() => {
                                    if (selectedDomain) {
                                        const sanitizedSubdomain = selectedDomain.subdomain
                                            ? finalizeSubdomainSanitize(selectedDomain.subdomain)
                                            : "";

                                        const sanitizedFullDomain = sanitizedSubdomain
                                            ? `${sanitizedSubdomain}.${selectedDomain.baseDomain}`
                                            : selectedDomain.baseDomain;

                                        setResourceFullDomain(sanitizedFullDomain);
                                        form.setValue("domainId", selectedDomain.domainId);
                                        form.setValue("subdomain", sanitizedSubdomain);

                                        setEditDomainOpen(false);

                                        toast({
                                            title: "Domain sanitized",
                                            description: `Final domain: ${sanitizedFullDomain}`,
                                        });
                                    }
                                }}
                            >
                                Select Domain
                            </Button>
                        </CredenzaFooter>
                    </CredenzaContent>
                </Credenza>
            </>
        )
    );
}
