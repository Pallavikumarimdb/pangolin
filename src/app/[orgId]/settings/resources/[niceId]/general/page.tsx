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
import { useEffect, useMemo, useState } from "react";
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
import { Globe, Crown, Trash2, Plus, ShieldCheck, Edit } from "lucide-react";
import { cn } from "@/lib/cn";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { build } from "@server/build";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { DomainRow } from "../../../../../../components/DomainsTable";
import { toASCII, toUnicode } from "punycode";


type HostMode = "multi" | "redirect";

type HostnameEntry = {
    hostnameId?: number; // present for existing hostnames
    domainId: string;
    baseDomain: string;
    subdomain?: string;
    fullDomain: string;
    primary: boolean;
    _delete?: boolean; // local flag for removal
};

export default function GeneralForm() {
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

    // hostMode from resource when available, default to "multi"
    const [hostMode, setHostMode] = useState<HostMode>(
        (resource as any)?.hostMode === "redirect" ? "redirect" : "multi"
    );

    // Available hostnames (existing + newly added)
    const [hostnames, setHostnames] = useState<HostnameEntry[]>([]);

    const [resourceFullDomain, setResourceFullDomain] = useState(
        `${resource.ssl ? "https" : "http"}://${toUnicode(resource.fullDomain || "")}`
    );

    const [pendingDomain, setPendingDomain] = useState<{
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
    } | null>(null);

    const [editingHostnameIndex, setEditingHostnameIndex] = useState<number | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);

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
            proxyPort: resource.proxyPort || undefined
        },
    });

    // Build a lookup for baseDomain by domainId
    const baseDomainById = useMemo(() => {
        const m = new Map<string, string>();
        baseDomains.forEach((d) => m.set(d.domainId, d.baseDomain));
        return m;
    }, [baseDomains]);

    // Initialize hostnames from resource or fallback to legacy single hostname
    const hydrateHostnamesFromResource = () => {
        const r: any = resource;

        if (Array.isArray(r.hostnames) && r.hostnames.length > 0) {
            const list: HostnameEntry[] = r.hostnames.map((h: any) => ({
                hostnameId: h.hostnameId,
                domainId: h.domainId,
                subdomain: h.subdomain ?? undefined,
                fullDomain: h.fullDomain,
                baseDomain: h.baseDomain,
                primary: !!h.primary
            }));
            setHostnames(list);
            const primary = list.find((h) => h.primary) ?? list[0];
            if (primary) {
                setResourceFullDomain(
                    `${resource.ssl ? "https" : "http"}://${primary.fullDomain}`
                );
            }
            return;
        }

        // Legacy fallback to single domain from resource.domainId + resource.subdomain
        if (resource.domainId && resource.fullDomain) {
            const bd = baseDomainById.get(resource.domainId) || "";
            const single: HostnameEntry = {
                hostnameId: undefined,
                domainId: resource.domainId,
                subdomain: resource.subdomain ?? undefined,
                fullDomain: resource.fullDomain!,
                baseDomain: bd,
                primary: true
            };
            setHostnames([single]);
            setResourceFullDomain(
                `${resource.ssl ? "https" : "http"}://${resource.fullDomain}`
            );
        } else {
            setHostnames([]);
        }
    };

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
                const rawDomains = res.data.data.domains as DomainRow[];
                const domains = rawDomains.map((domain) => ({
                    ...domain,
                    baseDomain: toUnicode(domain.baseDomain),
                }));
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
    }, [orgId]);

    useEffect(() => {
        if (baseDomains.length > 0 && !loadingPage) {
            hydrateHostnamesFromResource();
        }
    }, [baseDomains, resource, loadingPage]);

    const upsertHostname = (entry: HostnameEntry) => {
        setHostnames((prev) => {
            const existingNonDeleted = prev.filter(h => !h._delete);
            if (existingNonDeleted.some((h) => h.fullDomain === entry.fullDomain)) {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorUpdate"),
                    description: "A hostname with that domain already exists."
                });
                return prev;
            }

            const next = [...prev, entry];
            // will ensure exactly one primary among non-deleted items
            const aliveItems = next.filter(h => !h._delete);
            if (!aliveItems.some((h) => h.primary) && aliveItems.length > 0) {
                aliveItems[0].primary = true;
            }
            return next;
        });
    };

    const updateHostname = (index: number, updatedEntry: HostnameEntry) => {
        setHostnames((prev) => {
            const next = [...prev];
            const oldFullDomain = next[index].fullDomain;

            const otherHostnames = next.filter((_, i) => i !== index && !next[i]._delete);
            if (otherHostnames.some((h) => h.fullDomain === updatedEntry.fullDomain)) {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorUpdate"),
                    description: "A hostname with that domain already exists."
                });
                return prev;
            }

            next[index] = updatedEntry;

            const aliveItems = next.filter(h => !h._delete);
            if (!aliveItems.some((h) => h.primary) && aliveItems.length > 0) {
                aliveItems[0].primary = true;
            }
            return next;
        });
    };

    const removeHostname = (idx: number) => {
        setHostnames((prev) => {
            const next = [...prev];
            const target = next[idx];
            if (target.hostnameId) {
                // mark for deletion if it exists in DB
                next[idx] = { ...target, _delete: true, primary: false };
            } else {
                // remove if it's a new entry
                next.splice(idx, 1);
            }
            // If primary removed, select another as primary
            const aliveItems = next.filter(h => !h._delete);
            if (!aliveItems.some((h) => h.primary) && aliveItems.length > 0) {
                aliveItems[0].primary = true;
            }
            return next;
        });
    };

    const makePrimary = (idx: number) => {
        setHostnames((prev) => {
            const next = prev.map((h, i) =>
                i === idx ? { ...h, primary: true } : { ...h, primary: false }
            );
            return next;
        });
    };

    const handleEditHostname = (index: number) => {
        const hostname = hostnames[index];
        setEditingHostnameIndex(index);
        setIsEditMode(true);

        // Pre-populate the domain picker with current values
        setPendingDomain({
            domainId: hostname.domainId,
            subdomain: hostname.subdomain,
            baseDomain: hostname.baseDomain,
            fullDomain: hostname.fullDomain
        });

        setEditDomainOpen(true);
    };

    const handleSaveEdit = () => {
        if (editingHostnameIndex === null || !pendingDomain) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please select a valid domain configuration."
            });
            return;
        }

        const currentHostname = hostnames[editingHostnameIndex];

        const sanitizedSubdomain = pendingDomain.subdomain
            ? finalizeSubdomainSanitize(pendingDomain.subdomain)
            : "";

        const sanitizedFullDomain = sanitizedSubdomain
            ? `${sanitizedSubdomain}.${pendingDomain.baseDomain}`
            : pendingDomain.baseDomain;


        const updatedHostname: HostnameEntry = {
            ...currentHostname,
            domainId: pendingDomain.domainId,
            subdomain: sanitizedSubdomain || undefined,
            baseDomain: pendingDomain.baseDomain,
            fullDomain: sanitizedFullDomain
        };

        updateHostname(editingHostnameIndex, updatedHostname);

        // reset edit state
        setEditingHostnameIndex(null);
        setIsEditMode(false);
        setPendingDomain(null);
        setEditDomainOpen(false);
    };

    const handleCancelEdit = () => {
        setEditingHostnameIndex(null);
        setIsEditMode(false);
        setPendingDomain(null);
        setEditDomainOpen(false);
    };

    const aliveHostnames = useMemo(
        () => hostnames.filter((h) => !h._delete),
        [hostnames]
    );

    const primaryHostname = useMemo(
        () => aliveHostnames.find((h) => h.primary) || aliveHostnames[0],
        [aliveHostnames]
    );

    useEffect(() => {
        if (primaryHostname) {
            setResourceFullDomain(
                `${resource.ssl ? "https" : "http"}://${primaryHostname.fullDomain}`
            );
        } else if (resource.fullDomain) {
            setResourceFullDomain(
                `${resource.ssl ? "https" : "http"}://${resource.fullDomain}`
            );
        }
    }, [primaryHostname, resource.ssl, resource.fullDomain]);

    async function onSubmit(data: GeneralFormValues) {
        setSaveLoading(true);

        // build request body (preserve original fields)
        const body: any = {
            enabled: data.enabled,
            name: data.name,
            proxyPort: data.proxyPort
        };

        if (resource.http) {
            // new multi-domain payload
            body.hostMode = hostMode;

            // Only send hostnames if there are changes or if we're working with the new format
            const resourceHasHostnames = (resource as any).hostnames && Array.isArray((resource as any).hostnames);
            const hasHostnameChanges = hostnames.some(h => h._delete || !h.hostnameId);

            if (resourceHasHostnames || hasHostnameChanges || hostnames.length > 0) {
                body.hostnames = hostnames.map((h) => ({
                    hostnameId: h.hostnameId,
                    domainId: h.domainId,
                    subdomain: h.subdomain ? toASCII(h.subdomain) : undefined,
                    baseDomain: h.baseDomain,
                    fullDomain: h.fullDomain,
                    primary: !!h.primary,
                    _delete: h._delete
                }));
            }

            // Keep legacy compatibility fields if we're not using new hostnames format
            // if (!resourceHasHostnames && primaryHostname) {
            //     body.domainId = primaryHostname.domainId;
            //     body.subdomain = primaryHostname.subdomain ?? null;
            // }
        } else {
            // non-http legacy behavior
            body.domainId = data.domainId;
            body.subdomain = data.subdomain ? toASCII(data.subdomain) : undefined;
        }

        try {
            const res = await api
                .post<AxiosResponse<UpdateResourceResponse>>(
                    `resource/${resource?.resourceId}`,
                    body
                );

            if (res && res.status === 200) {
                toast({
                    title: t("resourceUpdated"),
                    description: t("resourceUpdatedDescription")
                });

                const updated = res.data.data;

                updateResource({
                    enabled: updated.enabled,
                    name: updated.name,
                    subdomain: updated.subdomain ?? null,
                    fullDomain: updated.fullDomain,
                    proxyPort: updated.proxyPort,
                    hostMode: (updated as any).hostMode,
                    hostnames: (updated as any).hostnames
                    // ...(!resource.http && {
                    //     enableProxy: data.enableProxy
                    // })
                } as any);

                // Refresh local hostnames from server response (source of truth)
                if (updated.hostnames) {
                    const nextHostnames: HostnameEntry[] = updated.hostnames.map(
                        (h) => ({
                            hostnameId: h.hostnameId,
                            domainId: h.domainId,
                            subdomain: h.subdomain,
                            baseDomain: h.baseDomain,
                            fullDomain: h.fullDomain,
                            primary: h.primary
                        })
                    );
                    setHostnames(nextHostnames);
                }

                router.refresh();
            }
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: t("resourceErrorUpdate"),
                description: formatAxiosError(
                    e,
                    t("resourceErrorUpdateDescription")
                )
            });
        }

        setSaveLoading(false);
    }

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
                                            </>
                                        )}

                                        {resource.http && (
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label>
                                                        {t("resourceDomain")}
                                                    </Label>
                                                    <div className="border p-2 rounded-md flex items-center justify-between">
                                                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                            <Globe size="14" />
                                                            {resourceFullDomain}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Host mode selector */}
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium">
                                                        Host handling
                                                    </Label>
                                                    <RadioGroup
                                                        value={hostMode}
                                                        onValueChange={(val: HostMode) => {
                                                            setHostMode(val);
                                                        }}
                                                        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                                                    >
                                                        <label
                                                            htmlFor="hostmode-redirect"
                                                            className={cn(
                                                                "relative flex rounded-lg border p-3 transition-colors cursor-pointer",
                                                                hostMode === "redirect"
                                                                    ? "border-primary bg-primary/10"
                                                                    : "border-input hover:bg-accent"
                                                            )}
                                                        >
                                                            <RadioGroupItem
                                                                value="redirect"
                                                                id="hostmode-redirect"
                                                                className="absolute left-3 top-3 h-4 w-4 border-primary text-primary"
                                                            />
                                                            <div className="pl-7">
                                                                <div className="flex items-center gap-2 font-medium">
                                                                    <ShieldCheck className="h-4 w-4" />
                                                                    Primary Domain Redirect
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    All other domains 301 redirect to primary.
                                                                </p>
                                                            </div>
                                                        </label>

                                                        <label
                                                            htmlFor="hostmode-multi"
                                                            className={cn(
                                                                "relative flex rounded-lg border p-3 transition-colors cursor-pointer",
                                                                hostMode === "multi"
                                                                    ? "border-primary bg-primary/10"
                                                                    : "border-input hover:bg-accent"
                                                            )}
                                                        >
                                                            <RadioGroupItem
                                                                value="multi"
                                                                id="hostmode-multi"
                                                                className="absolute left-3 top-3 h-4 w-4 border-primary text-primary"
                                                            />
                                                            <div className="pl-7">
                                                                <div className="flex items-center gap-2 font-medium">
                                                                    <Globe className="h-4 w-4" />
                                                                    Multi-Domain Mode
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    Serve the same resource on all assigned
                                                                    domains. No redirects.
                                                                </p>
                                                            </div>
                                                        </label>
                                                    </RadioGroup>
                                                </div>

                                                {/* Hostnames list */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between my-4">
                                                        <Label className="text-sm font-medium">
                                                            Assigned domains
                                                        </Label>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => {
                                                                setPendingDomain(null);
                                                                setIsEditMode(false);
                                                                setEditingHostnameIndex(null);
                                                                setEditDomainOpen(true);
                                                            }}
                                                        >
                                                            <Plus className="h-4 w-4 mr-1" />
                                                            Add Domain
                                                        </Button>
                                                    </div>

                                                    <div className="rounded-md border divide-y">
                                                        {aliveHostnames.length === 0 && (
                                                            <div className="text-sm text-muted-foreground p-3">
                                                                No domains assigned yet. Click{" "}
                                                                <span className="font-medium">Add Domain</span>{" "}
                                                                to assign one.
                                                            </div>
                                                        )}

                                                        {aliveHostnames.map((h, idx) => {
                                                            // Find the actual index in the full array for actions
                                                            const actualIdx = hostnames.findIndex(
                                                                orig => orig.fullDomain === h.fullDomain && !orig._delete
                                                            );

                                                            return (
                                                                <div
                                                                    key={`${h.hostnameId ?? "new"}-${h.fullDomain}`}
                                                                    className="flex items-center justify-between p-3"
                                                                >
                                                                    <div className="min-w-0">
                                                                        <div className="font-mono text-sm truncate">
                                                                            {h.fullDomain}
                                                                        </div>
                                                                        <div className="text-[11px] text-muted-foreground">
                                                                            {h.subdomain
                                                                                ? `${h.subdomain}.`
                                                                                : ""}
                                                                            {h.baseDomain}
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2">
                                                                        {h.primary ? (
                                                                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                                                                <Crown className="h-3 w-3" />
                                                                                Primary
                                                                            </span>
                                                                        ) : (
                                                                            <Button
                                                                                type="button"
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() => makePrimary(actualIdx)}
                                                                            >
                                                                                <Crown className="h-4 w-4 mr-1" />
                                                                                Make Primary
                                                                            </Button>
                                                                        )}

                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => handleEditHostname(actualIdx)}
                                                                        >
                                                                            <Edit className="h-4 w-4 mr-1" />
                                                                            Edit
                                                                        </Button>

                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                            onClick={() => removeHostname(actualIdx)}
                                                                            disabled={aliveHostnames.length === 1}
                                                                        >
                                                                            <Trash2 className="h-4 w-4 mr-1" />
                                                                            Remove
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Tip: You can add <code>example.ch</code> and{" "}
                                                        <code>www.example.ch</code>, then mark your
                                                        preferred one as Primary and choose "Primary Domain
                                                        Redirect".
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </form>
                                </Form>
                            </SettingsSectionForm>
                        </SettingsSectionBody>

                        <SettingsSectionFooter>
                            <Button
                                type="submit"
                                onClick={form.handleSubmit(onSubmit)}
                                loading={saveLoading}
                                disabled={saveLoading}
                            >
                                {t("saveSettings")}
                            </Button>
                        </SettingsSectionFooter>
                    </SettingsSection>
                </SettingsContainer>

                <Credenza
                    open={editDomainOpen}
                    onOpenChange={(open) => {
                        setEditDomainOpen(open);
                        if (!open) {
                            handleCancelEdit();
                        }
                    }}
                >
                    <CredenzaContent>
                        <CredenzaHeader>
                            <CredenzaTitle>
                                {isEditMode ? "Edit Domain" : "Add Domain"}
                            </CredenzaTitle>
                            <CredenzaDescription>
                                {isEditMode
                                    ? "Update the domain configuration for this resource."
                                    : "Pick a base domain and (optionally) subdomain to add as an alias for this resource."
                                }
                            </CredenzaDescription>
                        </CredenzaHeader>
                        <CredenzaBody>
                            <DomainPicker
                                orgId={orgId as string}
                                cols={1}
                                // Pre-populate with current values if editing
                                initialDomainId={isEditMode && editingHostnameIndex !== null ? hostnames[editingHostnameIndex]?.domainId : undefined}
                                initialSubdomain={isEditMode && editingHostnameIndex !== null ? hostnames[editingHostnameIndex]?.subdomain : undefined}
                                onDomainChange={(res) => {
                                    // Normalize into our local pendingDomain format
                                    const pd = {
                                        domainId: res.domainId,
                                        subdomain: res.subdomain,
                                        fullDomain: res.fullDomain,
                                        baseDomain: res.baseDomain
                                    };
                                    setPendingDomain(pd);
                                }}
                            />
                        </CredenzaBody>
                        <CredenzaFooter>
                            <CredenzaClose asChild>
                                <Button variant="outline" onClick={handleCancelEdit}>
                                    {t("cancel")}
                                </Button>
                            </CredenzaClose>
                            <Button
                                onClick={() => {
                                    if (!pendingDomain) {
                                        toast({
                                            variant: "destructive",
                                            title: "Select a domain",
                                            description:
                                                "Please choose a domain and subdomain (if needed) before saving."
                                        });
                                        return;
                                    }

                                    if (isEditMode) {
                                        handleSaveEdit();
                                    } else {
                                        const sanitizedSubdomain = pendingDomain.subdomain
                                            ? finalizeSubdomainSanitize(pendingDomain.subdomain)
                                            : "";

                                        const sanitizedFullDomain = sanitizedSubdomain
                                            ? `${sanitizedSubdomain}.${pendingDomain.baseDomain}`
                                            : pendingDomain.baseDomain;

                                        upsertHostname({
                                            domainId: pendingDomain.domainId,
                                            subdomain: sanitizedSubdomain,
                                            baseDomain: pendingDomain.baseDomain,
                                            fullDomain: sanitizedFullDomain,
                                            primary: aliveHostnames.length === 0 
                                        });
                                        setEditDomainOpen(false);
                                    }
                                }}
                            >
                                {isEditMode ? "Save Changes" : "Add"}
                            </Button>
                        </CredenzaFooter>
                    </CredenzaContent>
                </Credenza>
            </>
        )
    );
}