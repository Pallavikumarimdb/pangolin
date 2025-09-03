"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@app/components/ui/input";
import { InfoIcon } from "lucide-react";
import { Button } from "@app/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { AxiosResponse } from "axios";
import { useParams, useRouter } from "next/navigation";
import {
    CreateOrgApiKeyBody,
    CreateOrgApiKeyResponse
} from "@server/routers/apiKeys";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import CopyToClipboard from "@app/components/CopyToClipboard";
import moment from "moment";
import CopyCodeBox from "@server/emails/templates/components/CopyCodeBox";
import CopyTextBox from "@app/components/CopyTextBox";
import PermissionsSelectBox from "@app/components/PermissionsSelectBox";
import { useTranslations } from "next-intl";

export default function Page() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();

    const [loadingPage, setLoadingPage] = useState(true);
    const [createLoading, setCreateLoading] = useState(false);
    const [apiKey, setApiKey] = useState<CreateOrgApiKeyResponse | null>(null);
    const [selectedPermissions, setSelectedPermissions] = useState<
        Record<string, boolean>
    >({});

    const createFormSchema = z.object({
        name: z
            .string()
            .min(2, {
                message: t('nameMin', {len: 2})
            })
            .max(255, {
                message: t('nameMax', {len: 255})
            })
    });

    type CreateFormValues = z.infer<typeof createFormSchema>;

    const copiedFormSchema = z
        .object({
            copied: z.boolean()
        })
        .refine(
            (data) => {
                return data.copied;
            },
            {
                message: t('apiKeysConfirmCopy2'),
                path: ["copied"]
            }
        );

    type CopiedFormValues = z.infer<typeof copiedFormSchema>;

    const form = useForm<CreateFormValues>({
        resolver: zodResolver(createFormSchema),
        defaultValues: {
            name: ""
        }
    });

    const copiedForm = useForm<CopiedFormValues>({
        resolver: zodResolver(copiedFormSchema),
        defaultValues: {
            copied: true
        }
    });

    async function onSubmit(data: CreateFormValues) {
        setCreateLoading(true);

        const payload: CreateOrgApiKeyBody = {
            name: data.name
        };

        const res = await api
            .put<
                AxiosResponse<CreateOrgApiKeyResponse>
            >(`/org/${orgId}/api-key/`, payload)
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t('apiKeysErrorCreate'),
                    description: formatAxiosError(e)
                });
            });

        if (res && res.status === 201) {
            const data = res.data.data;

            console.log({
                actionIds: Object.keys(selectedPermissions).filter(
                    (key) => selectedPermissions[key]
                )
            });

            const actionsRes = await api
                .post(`/org/${orgId}/api-key/${data.apiKeyId}/actions`, {
                    actionIds: Object.keys(selectedPermissions).filter(
                        (key) => selectedPermissions[key]
                    )
                })
                .catch((e) => {
                    console.error(t('apiKeysErrorSetPermission'), e);
                    toast({
                        variant: "destructive",
                        title: t('apiKeysErrorSetPermission'),
                        description: formatAxiosError(e)
                    });
                });

            if (actionsRes) {
                setApiKey(data);
            }
        }

        setCreateLoading(false);
    }

    async function onCopiedSubmit(data: CopiedFormValues) {
        if (!data.copied) {
            return;
        }

        router.push(`/${orgId}/settings/api-keys`);
    }

    const formatLabel = (str: string) => {
        return str
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/^./, (char) => char.toUpperCase());
    };

    useEffect(() => {
        const load = async () => {
            setLoadingPage(false);
        };

        load();
    }, []);

    return (
        <>
            <div className="flex justify-between">
                <HeaderTitle
                    title={t('apiKeysCreate')}
                    description={t('apiKeysCreateDescription')}
                />
                <Button
                    variant="outline"
                    onClick={() => {
                        router.push(`/${orgId}/settings/api-keys`);
                    }}
                >
                    {t('apiKeysSeeAll')}
                </Button>
            </div>

            {!loadingPage && (
                <div>
                    <SettingsContainer>
                        {!apiKey && (
                            <>
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t('apiKeysTitle')}
                                        </SettingsSectionTitle>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <SettingsSectionForm>
                                            <Form {...form}>
                                                <form
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault(); // block default enter refresh
                                                        }
                                                    }}
                                                    className="space-y-4"
                                                    id="create-site-form"
                                                >
                                                    <FormField
                                                        control={form.control}
                                                        name="name"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t('name')}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        autoComplete="off"
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </form>
                                            </Form>
                                        </SettingsSectionForm>
                                    </SettingsSectionBody>
                                </SettingsSection>

                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t('apiKeysGeneralSettings')}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t('apiKeysGeneralSettingsDescription')}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <PermissionsSelectBox
                                            selectedPermissions={
                                                selectedPermissions
                                            }
                                            onChange={setSelectedPermissions}
                                        />
                                    </SettingsSectionBody>
                                </SettingsSection>
                            </>
                        )}

                        {apiKey && (
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t('apiKeysList')}
                                    </SettingsSectionTitle>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <InfoSections cols={2}>
                                        <InfoSection>
                                            <InfoSectionTitle>
                                                {t('name')}
                                            </InfoSectionTitle>
                                            <InfoSectionContent>
                                                <CopyToClipboard
                                                    text={apiKey.name}
                                                />
                                            </InfoSectionContent>
                                        </InfoSection>
                                        <InfoSection>
                                            <InfoSectionTitle>
                                                {t('created')}
                                            </InfoSectionTitle>
                                            <InfoSectionContent>
                                                {moment(
                                                    apiKey.createdAt
                                                ).format("lll")}
                                            </InfoSectionContent>
                                        </InfoSection>
                                    </InfoSections>

                                    <Alert variant="neutral">
                                        <InfoIcon className="h-4 w-4" />
                                        <AlertTitle className="font-semibold">
                                            {t('apiKeysSave')}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {t('apiKeysSaveDescription')}
                                        </AlertDescription>
                                    </Alert>

                                    {/* <h4 className="font-semibold"> */}
                                    {/*     {t('apiKeysInfo')} */}
                                    {/* </h4> */}

                                    <CopyTextBox
                                        text={`${apiKey.apiKeyId}.${apiKey.apiKey}`}
                                    />

                                    {/* <Form {...copiedForm}> */}
                                    {/*     <form */}
                                    {/*         className="space-y-4" */}
                                    {/*         id="copied-form" */}
                                    {/*     > */}
                                    {/*         <FormField */}
                                    {/*             control={copiedForm.control} */}
                                    {/*             name="copied" */}
                                    {/*             render={({ field }) => ( */}
                                    {/*                 <FormItem> */}
                                    {/*                     <div className="flex items-center space-x-2"> */}
                                    {/*                         <Checkbox */}
                                    {/*                             id="terms" */}
                                    {/*                             defaultChecked={ */}
                                    {/*                                 copiedForm.getValues( */}
                                    {/*                                     "copied" */}
                                    {/*                                 ) as boolean */}
                                    {/*                             } */}
                                    {/*                             onCheckedChange={( */}
                                    {/*                                 e */}
                                    {/*                             ) => { */}
                                    {/*                                 copiedForm.setValue( */}
                                    {/*                                     "copied", */}
                                    {/*                                     e as boolean */}
                                    {/*                                 ); */}
                                    {/*                             }} */}
                                    {/*                         /> */}
                                    {/*                         <label */}
                                    {/*                             htmlFor="terms" */}
                                    {/*                             className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" */}
                                    {/*                         > */}
                                    {/*                             {t('apiKeysConfirmCopy')} */}
                                    {/*                         </label> */}
                                    {/*                     </div> */}
                                    {/*                     <FormMessage /> */}
                                    {/*                 </FormItem> */}
                                    {/*             )} */}
                                    {/*         /> */}
                                    {/*     </form> */}
                                    {/* </Form> */}
                                </SettingsSectionBody>
                            </SettingsSection>
                        )}
                    </SettingsContainer>

                    <div className="flex justify-end space-x-2 mt-8">
                        {!apiKey && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={createLoading || apiKey !== null}
                                onClick={() => {
                                    router.push(`/${orgId}/settings/api-keys`);
                                }}
                            >
                                {t('cancel')}
                            </Button>
                        )}
                        {!apiKey && (
                            <Button
                                type="button"
                                loading={createLoading}
                                disabled={createLoading || apiKey !== null}
                                onClick={() => {
                                    form.handleSubmit(onSubmit)();
                                }}
                            >
                                {t('generate')}
                            </Button>
                        )}

                        {apiKey && (
                            <Button
                                type="button"
                                onClick={() => {
                                    copiedForm.handleSubmit(onCopiedSubmit)();
                                }}
                            >
                                {t('done')}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
