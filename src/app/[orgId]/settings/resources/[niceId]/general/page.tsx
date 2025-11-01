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
import { Textarea } from "@/components/ui/textarea";
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
import { AlertCircle, Globe } from "lucide-react";
import { build } from "@server/build";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { DomainRow } from "../../../../../../components/DomainsTable";
import { toASCII, toUnicode } from "punycode";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";
import { useSubscriptionStatusContext } from "@app/hooks/useSubscriptionStatusContext";
import { useUserContext } from "@app/hooks/useUserContext";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { Separator } from "@app/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@app/components/ui/radio-group";

export default function GeneralForm() {
    const [formKey, setFormKey] = useState(0);
    const params = useParams();
    const { resource, updateResource } = useResourceContext();
    const { org } = useOrgContext();
    const router = useRouter();
    const t = useTranslations();
    const [editDomainOpen, setEditDomainOpen] = useState(false);
    const {licenseStatus } = useLicenseStatusContext();
    const subscriptionStatus = useSubscriptionStatusContext();
    const {user} = useUserContext();

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
        `${resource.ssl ? "https" : "http"}://${toUnicode(resource.fullDomain || "")}`
    );
    const [selectedDomain, setSelectedDomain] = useState<{
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
    } | null>(null);

    const GeneralFormSchema = z
        .object({
            enabled: z.boolean(),
            subdomain: z.string().optional(),
            name: z.string().min(1).max(255),
            domainId: z.string().optional(),
            proxyPort: z.number().int().min(1).max(65535).optional(),
            // enableProxy: z.boolean().optional()
            maintenanceModeEnabled: z.boolean().optional(),
            maintenanceModeType: z.enum(["forced", "automatic"]).optional(),
            maintenanceTitle: z.string().max(255).optional(),
            maintenanceMessage: z.string().max(2000).optional(),
            maintenanceEstimatedTime: z.string().max(100).optional(),
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

    const form = useForm({
        resolver: zodResolver(GeneralFormSchema),
        defaultValues: {
            enabled: resource.enabled,
            name: resource.name,
            subdomain: resource.subdomain ? resource.subdomain : undefined,
            domainId: resource.domainId || undefined,
            proxyPort: resource.proxyPort || undefined,
            // enableProxy: resource.enableProxy || false
            maintenanceModeEnabled: resource.maintenanceModeEnabled || false,
            maintenanceModeType: resource.maintenanceModeType || "automatic",
            maintenanceTitle: resource.maintenanceTitle || "We'll be back soon!",
            maintenanceMessage: resource.maintenanceMessage || "We are currently performing scheduled maintenance. Please check back soon.",
            maintenanceEstimatedTime: resource.maintenanceEstimatedTime || "",
        },
        mode: "onChange"
    });

    const isMaintenanceEnabled = form.watch("maintenanceModeEnabled");
    const maintenanceModeType = form.watch("maintenanceModeType");

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
                    subdomain: data.subdomain ? toASCII(data.subdomain) : undefined,
                    domainId: data.domainId,
                    proxyPort: data.proxyPort,
                    // ...(!resource.http && {
                    //     enableProxy: data.enableProxy
                    // })
                    maintenanceModeEnabled: data.maintenanceModeEnabled,
                    maintenanceModeType: data.maintenanceModeType,
                    maintenanceTitle: data.maintenanceTitle || null,
                    maintenanceMessage: data.maintenanceMessage || null,
                    maintenanceEstimatedTime: data.maintenanceEstimatedTime || null,
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
                // ...(!resource.http && {
                //     enableProxy: data.enableProxy
                // })
                maintenanceModeEnabled: data.maintenanceModeEnabled,
                maintenanceModeType: data.maintenanceModeType,
                maintenanceTitle: data.maintenanceTitle || null,
                maintenanceMessage: data.maintenanceMessage || null,
                maintenanceEstimatedTime: data.maintenanceEstimatedTime || null,
            });

            router.refresh();
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
                                            <>
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

                                                <Separator className="my-6" />

                                                <div className="space-y-4">
                                                    <div>
                                                        <h3 className="text-lg font-medium">
                                                            Maintenance Mode
                                                        </h3>
                                                        <p className="text-sm text-muted-foreground">
                                                            Display a maintenance page to visitors
                                                        </p>
                                                    </div>

                                                    <FormField
                                                        control={form.control}
                                                        name="maintenanceModeEnabled"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center space-x-2">
                                                                    <FormControl>
                                                                        <SwitchInput
                                                                            id="enable-maintenance"
                                                                            checked={field.value}
                                                                            label="Enable Maintenance Mode"
                                                                            onCheckedChange={(val) =>
                                                                                form.setValue(
                                                                                    "maintenanceModeEnabled",
                                                                                    val
                                                                                )
                                                                            }
                                                                        />
                                                                    </FormControl>
                                                                </div>
                                                                <FormDescription>
                                                                    Show a maintenance page to visitors
                                                                </FormDescription>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    {isMaintenanceEnabled && (
                                                        <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                                                            <FormField
                                                                control={form.control}
                                                                name="maintenanceModeType"
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-3">
                                                                        <FormLabel>
                                                                            Maintenance Mode Type
                                                                        </FormLabel>
                                                                        <FormControl>
                                                                            <RadioGroup
                                                                                onValueChange={field.onChange}
                                                                                defaultValue={field.value}
                                                                                className="flex flex-col space-y-1"
                                                                            >
                                                                                <FormItem className="flex items-start space-x-3 space-y-0">
                                                                                    <FormControl>
                                                                                        <RadioGroupItem value="automatic" />
                                                                                    </FormControl>
                                                                                    <div className="space-y-1 leading-none">
                                                                                        <FormLabel className="font-normal">
                                                                                            <strong>Automatic</strong> (Recommended)
                                                                                        </FormLabel>
                                                                                        <FormDescription>
                                                                                            Show maintenance page only when all backend targets are down or unhealthy. 
                                                                                            Your resource continues working normally as long as at least one target is healthy.
                                                                                        </FormDescription>
                                                                                    </div>
                                                                                </FormItem>
                                                                                <FormItem className="flex items-start space-x-3 space-y-0">
                                                                                    <FormControl>
                                                                                        <RadioGroupItem value="forced" />
                                                                                    </FormControl>
                                                                                    <div className="space-y-1 leading-none">
                                                                                        <FormLabel className="font-normal">
                                                                                            <strong>Forced</strong>
                                                                                        </FormLabel>
                                                                                        <FormDescription>
                                                                                            Always show the maintenance page regardless of backend health. 
                                                                                            Use this for planned maintenance when you want to prevent all access.
                                                                                        </FormDescription>
                                                                                    </div>
                                                                                </FormItem>
                                                                            </RadioGroup>
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />

                                                            {maintenanceModeType === "forced" && (
                                                                <Alert>
                                                                    <AlertCircle className="h-4 w-4" />
                                                                    <AlertDescription>
                                                                        <strong>Warning:</strong> All traffic will be directed to the maintenance page. 
                                                                        Your backend resources will not receive any requests.
                                                                    </AlertDescription>
                                                                </Alert>
                                                            )}

                                                            <FormField
                                                                control={form.control}
                                                                name="maintenanceTitle"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Page Title</FormLabel>
                                                                        <FormControl>
                                                                            <Input 
                                                                                {...field}
                                                                                placeholder="We'll be back soon!"
                                                                            />
                                                                        </FormControl>
                                                                        <FormDescription>
                                                                            The main heading displayed on the maintenance page
                                                                        </FormDescription>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />

                                                            <FormField
                                                                control={form.control}
                                                                name="maintenanceMessage"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Maintenance Message</FormLabel>
                                                                        <FormControl>
                                                                            <Textarea 
                                                                                {...field}
                                                                                rows={4}
                                                                                placeholder="We are currently performing scheduled maintenance. Please check back soon."
                                                                            />
                                                                        </FormControl>
                                                                        <FormDescription>
                                                                            Detailed message explaining the maintenance
                                                                        </FormDescription>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />

                                                            <FormField
                                                                control={form.control}
                                                                name="maintenanceEstimatedTime"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>
                                                                            Estimated Completion Time (Optional)
                                                                        </FormLabel>
                                                                        <FormControl>
                                                                            <Input 
                                                                                {...field}
                                                                                placeholder="e.g., 2 hours, Nov 1 at 5:00 PM"
                                                                            />
                                                                        </FormControl>
                                                                        <FormDescription>
                                                                            When you expect maintenance to be completed
                                                                        </FormDescription>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </>
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

                                        setResourceFullDomain(`${resource.ssl ? "https" : "http"}://${sanitizedFullDomain}`);
                                        form.setValue("domainId", selectedDomain.domainId);
                                        form.setValue("subdomain", sanitizedSubdomain);

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
