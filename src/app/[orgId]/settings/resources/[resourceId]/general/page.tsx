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
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem
} from "@/components/ui/command";
import { cn } from "@app/lib/cn";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
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
import CustomDomainInput from "../CustomDomainInput";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { subdomainSchema, tlsNameSchema } from "@server/lib/schemas";
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { RadioGroup, RadioGroupItem } from "@app/components/ui/radio-group";
import { Label } from "@app/components/ui/label";
import { ListDomainsResponse } from "@server/routers/domain";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import {
    UpdateResourceResponse,
    updateResourceRule
} from "@server/routers/resource";
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
import { Globe } from "lucide-react";
import { build } from "@server/build";
import { DomainRow } from "../../../domains/DomainsTable";
import { toUnicode } from "punycode";

const TransferFormSchema = z.object({
    siteId: z.number()
});

type TransferFormValues = z.infer<typeof TransferFormSchema>;

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
    const [resourceFullDomain, setResourceFullDomain] = useState(
        `${resource.ssl ? "https" : "http"}://${resource.fullDomain}`
    );
    const [selectedDomain, setSelectedDomain] = useState<{
        domainId: string;
        subdomain?: string;
        fullDomain: string;
    } | null>(null);

    const GeneralFormSchema = z
        .object({
            enabled: z.boolean(),
            subdomain: z.string().optional(),
            name: z.string().min(1).max(255),
            domainId: z.string().optional(),
            proxyPort: z.number().int().min(1).max(65535).optional(),
            enableProxy: z.boolean().optional()
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
            enableProxy: resource.enableProxy || false
        },
        mode: "onChange"
    });

    const transferForm = useForm<TransferFormValues>({
        resolver: zodResolver(TransferFormSchema),
        defaultValues: {
            siteId: resource.siteId ? Number(resource.siteId) : undefined
        }
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
                    ...(!resource.http && {
                        enableProxy: data.enableProxy
                    })
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

            const resource = res.data.data;

            updateResource({
                enabled: data.enabled,
                name: data.name,
                subdomain: data.subdomain,
                fullDomain: resource.fullDomain,
                proxyPort: data.proxyPort,
                ...(!resource.http && {
                    enableProxy: data.enableProxy
                }),
            });

            router.refresh();
        }
        setSaveLoading(false);
    }

    async function onTransfer(data: TransferFormValues) {
        setTransferLoading(true);

        const res = await api
            .post(`resource/${resource?.resourceId}/transfer`, {
                siteId: data.siteId
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorTransfer"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorTransferDescription")
                    )
                });
            });

        if (res && res.status === 200) {
            toast({
                title: t("resourceTransferred"),
                description: t("resourceTransferredDescription")
            });
            router.refresh();

            updateResource({
                siteName:
                    sites.find((site) => site.siteId === data.siteId)?.name ||
                    ""
            });
        }
        setTransferLoading(false);
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

                                                {build == "oss" && (
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
                                                )}
                                            </>
                                        )}

                                        {resource.http && (
                                            <div className="space-y-2">
                                                <Label>Domain</Label>
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
                                                        Edit Domain
                                                    </Button>
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
                                onClick={() => {
                                    console.log(form.getValues());
                                }}
                                loading={saveLoading}
                                disabled={saveLoading}
                                form="general-settings-form"
                            >
                                {t("saveSettings")}
                            </Button>
                        </SettingsSectionFooter>
                    </SettingsSection>

                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("resourceTransfer")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("resourceTransferDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>

                        <SettingsSectionBody>
                            <SettingsSectionForm>
                                <Form {...transferForm}>
                                    <form
                                        onSubmit={transferForm.handleSubmit(
                                            onTransfer
                                        )}
                                        className="space-y-4"
                                        id="transfer-form"
                                    >
                                        <FormField
                                            control={transferForm.control}
                                            name="siteId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("siteDestination")}
                                                    </FormLabel>
                                                    <Popover
                                                        open={open}
                                                        onOpenChange={setOpen}
                                                    >
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button
                                                                    variant="outline"
                                                                    role="combobox"
                                                                    className={cn(
                                                                        "w-full justify-between",
                                                                        !field.value &&
                                                                        "text-muted-foreground"
                                                                    )}
                                                                >
                                                                    {field.value
                                                                        ? sites.find(
                                                                            (
                                                                                site
                                                                            ) =>
                                                                                site.siteId ===
                                                                                field.value
                                                                        )
                                                                            ?.name
                                                                        : t(
                                                                            "siteSelect"
                                                                        )}
                                                                    <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent
                                                            className="w-full p-0"
                                                            align="start"
                                                        >
                                                            <Command>
                                                                <CommandInput
                                                                    placeholder={t(
                                                                        "searchSites"
                                                                    )}
                                                                />
                                                                <CommandEmpty>
                                                                    {t(
                                                                        "sitesNotFound"
                                                                    )}
                                                                </CommandEmpty>
                                                                <CommandGroup>
                                                                    {sites.map(
                                                                        (
                                                                            site
                                                                        ) => (
                                                                            <CommandItem
                                                                                value={`${site.name}:${site.siteId}`}
                                                                                key={
                                                                                    site.siteId
                                                                                }
                                                                                onSelect={() => {
                                                                                    transferForm.setValue(
                                                                                        "siteId",
                                                                                        site.siteId
                                                                                    );
                                                                                    setOpen(
                                                                                        false
                                                                                    );
                                                                                }}
                                                                            >
                                                                                {
                                                                                    site.name
                                                                                }
                                                                                <CheckIcon
                                                                                    className={cn(
                                                                                        "ml-auto h-4 w-4",
                                                                                        site.siteId ===
                                                                                            field.value
                                                                                            ? "opacity-100"
                                                                                            : "opacity-0"
                                                                                    )}
                                                                                />
                                                                            </CommandItem>
                                                                        )
                                                                    )}
                                                                </CommandGroup>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </form>
                                </Form>
                            </SettingsSectionForm>
                        </SettingsSectionBody>

                        <SettingsSectionFooter>
                            <Button
                                type="submit"
                                loading={transferLoading}
                                disabled={transferLoading}
                                form="transfer-form"
                            >
                                {t("resourceTransferSubmit")}
                            </Button>
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
                                        fullDomain: res.fullDomain
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
                                        setResourceFullDomain(
                                            selectedDomain.fullDomain
                                        );
                                        form.setValue(
                                            "domainId",
                                            selectedDomain.domainId
                                        );
                                        form.setValue(
                                            "subdomain",
                                            selectedDomain.subdomain
                                        );
                                        setEditDomainOpen(false);
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
