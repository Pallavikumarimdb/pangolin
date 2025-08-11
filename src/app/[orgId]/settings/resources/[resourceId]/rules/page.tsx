"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { AxiosResponse } from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import {
    ColumnDef,
    getFilteredRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    getCoreRowModel,
    useReactTable,
    flexRender
} from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@app/components/ui/table";
import { toast } from "@app/hooks/useToast";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { ArrayElement } from "@server/types/ArrayElement";
import { formatAxiosError } from "@app/lib/api/formatAxiosError";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient } from "@app/lib/api";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionFooter
} from "@app/components/Settings";
import { ListResourceRulesResponse } from "@server/routers/resource/listResourceRules";
import { SwitchInput } from "@app/components/SwitchInput";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { ArrowUpDown, Check, InfoIcon, X, Plus, Settings, Trash2 } from "lucide-react";
import {
    InfoSection,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { InfoPopup } from "@app/components/ui/info-popup";
import {
    isValidCIDR,
    isValidIP,
    isValidUrlGlobPattern
} from "@server/lib/validators";
import { Switch } from "@app/components/ui/switch";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Import our new modular IP Set components
import IPSetManager, { IPSet } from "@app/components/ipsets/IPSetManager";
import IPSetSelector from "@app/components/ipsets/IPSetSelector";
import useIPSets from "@app/hooks/useIPSets";

// Schema for rule validation with IP_CIDR support
const addRuleSchema = z.object({
    action: z.string(),
    match: z.string(),
    value: z.string(),
    priority: z.coerce.number().int().optional(),
    ipSetId: z.string().optional()
});

type LocalRule = ArrayElement<ListResourceRulesResponse["rules"]> & {
    new?: boolean;
    updated?: boolean;
    ipSetId: string | null
    ipSetName: string | null
};

export default function ResourceRules(props: {
    params: Promise<{ resourceId: number }>;
}) {
    const params = use(props.params);
    const { resource, updateResource } = useResourceContext();
    const api = createApiClient(useEnvContext());
    const [rules, setRules] = useState<LocalRule[]>([]);
    const [rulesToRemove, setRulesToRemove] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [rulesEnabled, setRulesEnabled] = useState(resource.applyRules);
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();

    // Use our custom IP Sets hook
    const {
        ipSets,
        loading: ipSetsLoading,
        getIPSetById
    } = useIPSets({
        orgId: orgId as string,
        t,
        onError: (error) => console.error('IP Sets error:', error)
    });

    const RuleAction = {
        ACCEPT: t('alwaysAllow'),
        DROP: t('alwaysDeny')
    } as const;

    const RuleMatch = {
        PATH: t('path'),
        IP_CIDR: t('ipOrRange'),
        IP_SET: t('ipSet')
    } as const;

    const addRuleForm = useForm({
        resolver: zodResolver(addRuleSchema),
        defaultValues: {
            action: "ACCEPT",
            match: "IP_CIDR",
            value: "",
            ipSetId: ""
        }
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const rulesRes = await api.get<
                    AxiosResponse<ListResourceRulesResponse>
                >(`/resource/${params.resourceId}/rules`);
                if (rulesRes.status === 200) {
                    setRules(rulesRes.data.data.rules);
                }
            } catch (err) {
                console.error(err);
                toast({
                    variant: "destructive",
                    title: t('rulesErrorFetch'),
                    description: formatAxiosError(
                        err,
                        t('rulesErrorFetchDescription')
                    )
                });
            } finally {
                setPageLoading(false);
            }
        };
        fetchData();
    }, []);

    // Preserve match type between additions
    const [lastMatchType, setLastMatchType] = useState("IP_CIDR");

    async function addRule(data: z.infer<typeof addRuleSchema>) {
        const isDuplicate = rules.some(
            (rule) =>
                rule.action === data.action &&
                rule.match === data.match &&
                rule.value === data.value &&
                rule.ipSetId === data.ipSetId
        );

        if (isDuplicate) {
            toast({
                variant: "destructive",
                title: t('rulesErrorDuplicate'),
                description: t('rulesErrorDuplicateDescription')
            });
            return;
        }

        if (data.match === "IP_CIDR") {
            const isIP = isValidIP(data.value);
            const isCIDR = isValidCIDR(data.value);
            if (!isIP && !isCIDR) {
                toast({
                    variant: "destructive",
                    title: t('rulesErrorInvalidIpOrRange'),
                    description: t('rulesErrorInvalidIpOrRangeDescription')
                });
                return;
            }
        }
        else if (data.match === "PATH" && !isValidUrlGlobPattern(data.value)) {
            toast({
                variant: "destructive",
                title: t('rulesErrorInvalidUrl'),
                description: t('rulesErrorInvalidUrlDescription')
            });
            return;
        } else if (data.match === "IP_SET" && !data.ipSetId) {
            toast({
                variant: "destructive",
                title: t('rulesErrorNoIPSet'),
                description: t('rulesErrorNoIPSetDescription')
            });
            return;
        } else if (data.match === "IP_SET" && data.ipSetId) {
            data.value = data.ipSetId;
        }

        // Find the highest priority and add one
        let priority = data.priority;
        if (priority === undefined) {
            priority = rules.reduce(
                (acc, rule) => (rule.priority > acc ? rule.priority : acc),
                0
            );
            priority++;
        }

        // Find IP Set name for display
        const selectedIPSet = getIPSetById(data.ipSetId || "");

        const newRule: LocalRule = {
            ...data,
            ruleId: new Date().getTime(),
            new: true,
            resourceId: resource.resourceId,
            priority,
            enabled: true,
            ipSetName: selectedIPSet?.name ?? null,
            ipSetId: data.match === "IP_SET" ? (data.ipSetId || null) : null
        };

        setRules([...rules, newRule]);

        setLastMatchType(data.match);
        addRuleForm.reset({
            action: data.action,
            match: data.match,
            value: "",
            ipSetId: ""
        });
    }

    const removeRule = (ruleId: number) => {
        setRules([...rules.filter((rule) => rule.ruleId !== ruleId)]);
        if (!rules.find((rule) => rule.ruleId === ruleId)?.new) {
            setRulesToRemove([...rulesToRemove, ruleId]);
        }
    };

    async function updateRule(ruleId: number, data: Partial<LocalRule>) {
        // Clean up ipSetId when not using IP_SET
        if (data.match && data.match !== "IP_SET") {
            data.ipSetId = null;
        }

        setRules(
            rules.map((rule) =>
                rule.ruleId === ruleId
                    ? { ...rule, ...data, updated: true }
                    : rule
            )
        );
    }

    function getValueHelpText(type: string) {
        switch (type) {
            case "IP_CIDR":
                return t('rulesMatchIpOrRangeDescription');
            case "PATH":
                return t('rulesMatchUrl');
            case "IP_SET":
                return t('rulesMatchIPSetDescription');
            default:
                return "";
        }
    }

    async function saveAllSettings() {
        try {
            setLoading(true);

            const res = await api
                .post(`/resource/${params.resourceId}`, {
                    applyRules: rulesEnabled
                })
                .catch((err) => {
                    console.error(err);
                    toast({
                        variant: "destructive",
                        title: t('rulesErrorUpdate'),
                        description: formatAxiosError(
                            err,
                            t('rulesErrorUpdateDescription')
                        )
                    });
                    throw err;
                });

            if (res && res.status === 200) {
                updateResource({ applyRules: rulesEnabled });
            }

            // Save rules
            for (const rule of rules) {
                const data = {
                    action: rule.action,
                    match: rule.match,
                    value: rule.value,
                    priority: rule.priority,
                    enabled: rule.enabled,
                    ipSetId: rule.ipSetId
                };

                if (rule.match === "IP_CIDR") {
                    const isIP = isValidIP(rule.value);
                    const isCIDR = isValidCIDR(rule.value);
                    if (!isIP && !isCIDR) {
                        toast({
                            variant: "destructive",
                            title: t('rulesErrorInvalidIpOrRange'),
                            description: t('rulesErrorInvalidIpOrRangeDescription')
                        });
                        setLoading(false);
                        return;
                    }
                }

                if (rule.match === "PATH" && !isValidUrlGlobPattern(rule.value)) {
                    toast({
                        variant: "destructive",
                        title: t('rulesErrorInvalidUrl'),
                        description: t('rulesErrorInvalidUrlDescription')
                    });
                    setLoading(false);
                    return;
                }

                if (rule.match === "IP_SET" && !rule.ipSetId) {
                    toast({
                        variant: "destructive",
                        title: t('rulesErrorNoIPSet'),
                        description: t('rulesErrorNoIPSetDescription')
                    });
                    setLoading(false);
                    return;
                }

                // Inside the rule validation loop:
                if (rule.match === "IP_SET") {
                    // Validate IP set exists
                    const ipSetExists = ipSets.some(set => set.id === rule.ipSetId);
                    if (!ipSetExists) {
                        toast({
                            variant: "destructive",
                            title: t('rulesErrorInvalidIPSet'),
                            description: t('rulesErrorInvalidIPSetDescription')
                        });
                        setLoading(false);
                        return;
                    }
                }

                if (rule.priority === undefined) {
                    toast({
                        variant: "destructive",
                        title: t('rulesErrorInvalidPriority'),
                        description: t('rulesErrorInvalidPriorityDescription')
                    });
                    setLoading(false);
                    return;
                }

                // Check for duplicate priorities
                const priorities = rules.map((r) => r.priority);
                if (priorities.length !== new Set(priorities).size) {
                    toast({
                        variant: "destructive",
                        title: t('rulesErrorDuplicatePriority'),
                        description: t('rulesErrorDuplicatePriorityDescription')
                    });
                    setLoading(false);
                    return;
                }

                if (rule.new) {
                    const res = await api.put(
                        `/resource/${params.resourceId}/rule`,
                        data
                    );
                    rule.ruleId = res.data.data.ruleId;
                } else if (rule.updated) {
                    await api.post(
                        `/resource/${params.resourceId}/rule/${rule.ruleId}`,
                        data
                    );
                }

                setRules([
                    ...rules.map((r) => {
                        const res = {
                            ...r,
                            new: false,
                            updated: false
                        };
                        return res;
                    })
                ]);
            }

            // Remove deleted rules
            for (const ruleId of rulesToRemove) {
                await api.delete(
                    `/resource/${params.resourceId}/rule/${ruleId}`
                );
            }

            // Update state
            setRules(rules.map(r => ({ ...r, new: false, updated: false })));
            setRulesToRemove([]);

            toast({
                title: t('ruleUpdated'),
                description: t('ruleUpdatedDescription')
            });

            router.refresh();
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t('ruleErrorUpdate'),
                description: formatAxiosError(
                    err,
                    t('ruleErrorUpdateDescription')
                )
            });
        }
        setLoading(false);
    }

    const columns: ColumnDef<LocalRule>[] = [
        {
            accessorKey: "priority",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t('rulesPriority')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => (
                <Input
                    defaultValue={row.original.priority}
                    className="w-[75px]"
                    type="number"
                    onBlur={(e) => {
                        const parsed = z.coerce
                            .number()
                            .int()
                            .optional()
                            .safeParse(e.target.value);

                        if (!parsed.success || parsed.data === undefined) {
                            toast({
                                variant: "destructive",
                                title: t('rulesErrorInvalidPriority'),
                                description: t('rulesErrorInvalidPriorityDescription')
                            });
                            return;
                        }

                        updateRule(row.original.ruleId, {
                            priority: parsed.data
                        });
                    }}
                />
            )
        },
        {
            accessorKey: "action",
            header: t('rulesAction'),
            cell: ({ row }) => (
                <Select
                    defaultValue={row.original.action}
                    onValueChange={(value: "ACCEPT" | "DROP") =>
                        updateRule(row.original.ruleId, { action: value })
                    }
                >
                    <SelectTrigger className="min-w-[150px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ACCEPT">
                            {RuleAction.ACCEPT}
                        </SelectItem>
                        <SelectItem value="DROP">{RuleAction.DROP}</SelectItem>
                    </SelectContent>
                </Select>
            )
        },
        {
            accessorKey: "match",
            header: t('rulesMatchType'),
            cell: ({ row }) => (
                <Select
                    defaultValue={row.original.match === "IP" || row.original.match === "CIDR" ? "IP_CIDR" : row.original.match}
                    onValueChange={(value: "IP_CIDR" | "PATH" | "IP_SET") =>
                        updateRule(row.original.ruleId, {
                            match: value,
                            ...(value !== "IP_SET" && { ipSetId: null })
                        })
                    }
                >
                    <SelectTrigger className="min-w-[125px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {resource.http && (
                            <SelectItem value="PATH">{RuleMatch.PATH}</SelectItem>
                        )}
                        <SelectItem value="IP_CIDR">{RuleMatch.IP_CIDR}</SelectItem>
                        <SelectItem value="IP_SET">{RuleMatch.IP_SET}</SelectItem>
                    </SelectContent>
                </Select>
            )
        },
        {
            accessorKey: "value",
            header: t('value'),
            cell: ({ row }) => {
                if (row.original.match === "IP_SET") {
                    return (
                        <IPSetSelector
                            ipSets={ipSets}
                            value={row.original.ipSetId || ""}
                            onValueChange={(value) =>
                                updateRule(row.original.ruleId, {
                                    ipSetId: value,
                                    value: value
                                })
                            }
                            placeholder={t('selectIPSet')}
                        />
                    );
                }

                return (
                    <Input
                        defaultValue={row.original.value}
                        className="min-w-[200px]"
                        onBlur={(e) =>
                            updateRule(row.original.ruleId, {
                                value: e.target.value
                            })
                        }
                    />
                );
            }
        },
        {
            accessorKey: "enabled",
            header: t('enabled'),
            cell: ({ row }) => (
                <Switch
                    defaultChecked={row.original.enabled}
                    onCheckedChange={(val) =>
                        updateRule(row.original.ruleId, { enabled: val })
                    }
                />
            )
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <div className="flex items-center justify-end space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeRule(row.original.ruleId)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )
        }
    ];

    const table = useReactTable({
        data: rules,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            pagination: {
                pageIndex: 0,
                pageSize: 1000
            }
        }
    });

    if (pageLoading) {
        return <></>;
    }

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t('rulesResource')}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t('rulesResourceDescription')}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <div className="space-y-6">
                        {/* Rules Toggle */}
                        <div className="flex items-center space-x-2">
                            <SwitchInput
                                id="rules-toggle"
                                label={t('rulesEnable')}
                                defaultChecked={rulesEnabled}
                                onCheckedChange={(val) => setRulesEnabled(val)}
                            />
                        </div>

                        {/* IP Sets Management - Now using modular component */}
                        <IPSetManager
                            orgId={orgId as string}
                            t={t}
                        />

                        <Separator />

                        {/* Add Rule Form */}
                        <Form {...addRuleForm}>
                            <form
                                onSubmit={addRuleForm.handleSubmit(addRule)}
                                className="space-y-4"
                            >
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                    <FormField
                                        control={addRuleForm.control}
                                        name="action"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('rulesAction')}</FormLabel>
                                                <FormControl>
                                                    <Select
                                                        value={field.value}
                                                        onValueChange={field.onChange}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="ACCEPT">
                                                                {RuleAction.ACCEPT}
                                                            </SelectItem>
                                                            <SelectItem value="DROP">
                                                                {RuleAction.DROP}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={addRuleForm.control}
                                        name="match"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('rulesMatchType')}</FormLabel>
                                                <FormControl>
                                                    <Select
                                                        value={field.value}
                                                        onValueChange={(value) => {
                                                            field.onChange(value);
                                                            setLastMatchType(value);
                                                            // Fix: Set empty string instead of undefined
                                                            if (value !== "IP_SET") {
                                                                addRuleForm.setValue("ipSetId", "");
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {resource.http && (
                                                                <SelectItem value="PATH">
                                                                    {RuleMatch.PATH}
                                                                </SelectItem>
                                                            )}
                                                            <SelectItem value="IP_CIDR">
                                                                {RuleMatch.IP_CIDR}
                                                            </SelectItem>
                                                            <SelectItem value="IP_SET">
                                                                {RuleMatch.IP_SET}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* Conditional rendering based on match type */}
                                    {addRuleForm.watch("match") === "IP_SET" ? (
                                        <FormField
                                            control={addRuleForm.control}
                                            name="ipSetId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t('ipSet')}</FormLabel>
                                                    <FormControl>
                                                        <IPSetSelector
                                                            ipSets={ipSets}
                                                            value={field.value}
                                                            onValueChange={field.onChange}
                                                            placeholder={t('selectIPSet')}
                                                            className="w-full"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    ) : (
                                        <FormField
                                            control={addRuleForm.control}
                                            name="value"
                                            render={({ field }) => (
                                                <FormItem className="gap-1">
                                                    <InfoPopup
                                                        text={t('value')}
                                                        info={
                                                            getValueHelpText(
                                                                addRuleForm.watch("match")
                                                            ) || ""
                                                        }
                                                    />
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            placeholder={
                                                                addRuleForm.watch("match") === "IP_CIDR"
                                                                    ? "192.168.1.1 or 192.168.1.0/24"
                                                                    : addRuleForm.watch("match") === "PATH"
                                                                        ? "/api/* or /admin/**"
                                                                        : ""
                                                            }
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    <Button
                                        type="submit"
                                        variant="secondary"
                                        disabled={!rulesEnabled || loading}
                                        className="w-full"
                                    >
                                        {t('addRule')}
                                    </Button>
                                </div>
                            </form>
                        </Form>

                        {/* Rules Table */}
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <TableRow key={headerGroup.id}>
                                            {headerGroup.headers.map((header) => (
                                                <TableHead key={header.id}>
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                            header.column.columnDef
                                                                .header,
                                                            header.getContext()
                                                        )}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableHeader>
                                <TableBody>
                                    {table.getRowModel().rows?.length ? (
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id}>
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id}>
                                                        {flexRender(
                                                            cell.column.columnDef.cell,
                                                            cell.getContext()
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={columns.length}
                                                className="h-24 text-center"
                                            >
                                                {t('rulesNoOne')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </SettingsSectionBody>
            </SettingsSection>

            {/* Save Button */}
            <div className="flex justify-end space-x-2">
                <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    disabled={loading}
                >
                    {t('resetChanges')}
                </Button>
                <Button
                    onClick={saveAllSettings}
                    loading={loading}
                    disabled={loading}
                    className="min-w-[120px]"
                >
                    {loading ? t('saving') : t('saveAllSettings')}
                    {(rules.some(r => r.new || r.updated) || rulesToRemove.length > 0) && (
                        <Badge variant="destructive" className="ml-2 px-1">
                            {rules.filter(r => r.new || r.updated).length + rulesToRemove.length}
                        </Badge>
                    )}
                </Button>
            </div>
        </SettingsContainer>
    );
}