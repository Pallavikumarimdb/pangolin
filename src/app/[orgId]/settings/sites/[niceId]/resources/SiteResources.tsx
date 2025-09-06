'use client';

import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    SortingState,
    getSortedRowModel,
    ColumnFiltersState,
    getFilteredRowModel
} from "@tanstack/react-table";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm
} from "@app/components/Settings";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { Button } from "@app/components/ui/button";
import {
    ArrowRight,
    ArrowUpDown,
    MoreHorizontal,
    ArrowUpRight,
    ShieldOff,
    ShieldCheck,
    Server
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { formatAxiosError } from "@app/lib/api";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import CopyToClipboard from "@app/components/CopyToClipboard";
import { Switch } from "@app/components/ui/switch";
import { AxiosResponse } from "axios";
import { UpdateResourceResponse } from "@server/routers/resource";
import { ListSitesResponse } from "@server/routers/site";
import { useTranslations } from "next-intl";
import { InfoPopup } from "@app/components/ui/info-popup";
import { Input } from "@app/components/ui/input";
import { DataTablePagination } from "@app/components/DataTablePagination";
import { Plus, Search } from "lucide-react";
import { Card, CardContent, CardHeader } from "@app/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@app/components/ui/table";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { ResourceRow } from "@app/components/ResourcesTable";

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

type SiteResourcesSummaryProps = {
    siteId: number;
    siteNiceId: string;
    resources: SiteResourceRow[];
    orgId: string;
};


const STORAGE_KEYS = {
    PAGE_SIZE: 'siteResource-page-size',
    getTablePageSize: (tableId?: string) =>
        tableId ? `siteResource-${tableId}-page-size` : STORAGE_KEYS.PAGE_SIZE
};

const getStoredPageSize = (tableId?: string, defaultSize = 20): number => {
    if (typeof window === 'undefined') return defaultSize;

    try {
        const key = STORAGE_KEYS.getTablePageSize(tableId);
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = parseInt(stored, 10);
            if (parsed > 0 && parsed <= 1000) {
                return parsed;
            }
        }
    } catch (error) {
        console.warn('Failed to read page size from localStorage:', error);
    }
    return defaultSize;
};

const setStoredPageSize = (pageSize: number, tableId?: string): void => {
    if (typeof window === 'undefined') return;

    try {
        const key = STORAGE_KEYS.getTablePageSize(tableId);
        localStorage.setItem(key, pageSize.toString());
    } catch (error) {
        console.warn('Failed to save page size to localStorage:', error);
    }
};


export default function SiteResourcesSummary({
    siteId,
    resources,
    siteNiceId,
    orgId,
}: SiteResourcesSummaryProps) {

    const resourceCount = resources.length;
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations();

    const { env } = useEnvContext();

    const api = createApiClient({ env });

    const [proxyPageSize, setProxyPageSize] = useState<number>(() =>
        getStoredPageSize('proxy-resources', 20)
    );

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedResource, setSelectedResource] =
        useState<ResourceRow | null>();
    const [proxySorting, setProxySorting] = useState<SortingState>([]);
    const [proxyColumnFilters, setProxyColumnFilters] =
        useState<ColumnFiltersState>([]);
    const [proxyGlobalFilter, setProxyGlobalFilter] = useState<any>([]);

    const getSearchInput = () => {
        return (
            <div className="relative w-full sm:max-w-sm">
                <Input
                    placeholder={t("resourcesSearch")}
                    value={proxyGlobalFilter ?? ""}
                    onChange={(e) =>
                        proxyTable.setGlobalFilter(String(e.target.value))
                    }
                    className="w-full pl-8"
                />
                <Search className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            </div>
        );
    };


    const deleteResource = (resourceId: number) => {
        api.delete(`/resource/${resourceId}`)
            .catch((e) => {
                console.error(t("resourceErrorDelte"), e);
                toast({
                    variant: "destructive",
                    title: t("resourceErrorDelte"),
                    description: formatAxiosError(e, t("resourceErrorDelte"))
                });
            })
            .then(() => {
                router.refresh();
                setIsDeleteModalOpen(false);
            });
    };

    async function toggleResourceEnabled(val: boolean, resourceId: number) {
        const res = await api
            .post<AxiosResponse<UpdateResourceResponse>>(
                `resource/${resourceId}`,
                {
                    enabled: val
                }
            )
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourcesErrorUpdate"),
                    description: formatAxiosError(
                        e,
                        t("resourcesErrorUpdateDescription")
                    )
                });
            });
    }

    const proxyColumns: ColumnDef<ResourceRow>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("name")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "protocol",
            header: t("protocol"),
            cell: ({ row }) => {
                const resourceRow = row.original;
                return <span>{resourceRow.protocol.toUpperCase()}</span>;
            }
        },
        {
            accessorKey: "domain",
            header: t("access"),
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <div className="flex items-center space-x-2">
                        {!resourceRow.http ? (
                            <CopyToClipboard
                                text={resourceRow.proxyPort ? resourceRow.proxyPort.toString() : ""}
                                isLink={false}
                            />
                        ) : !resourceRow.domainId ? (
                            <InfoPopup
                                info={t("domainNotFoundDescription")}
                                text={t("domainNotFound")}
                            />
                        ) : (
                            <CopyToClipboard
                                text={resourceRow.domain}
                                isLink={true}
                            />
                        )}
                    </div>
                );
            }
        },
        {
            accessorKey: "authState",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("authentication")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <div>
                        {resourceRow.authState === "protected" ? (
                            <span className="text-green-500 flex items-center space-x-2">
                                <ShieldCheck className="w-4 h-4" />
                                <span>{t("protected")}</span>
                            </span>
                        ) : resourceRow.authState === "not_protected" ? (
                            <span className="text-yellow-500 flex items-center space-x-2">
                                <ShieldOff className="w-4 h-4" />
                                <span>{t("notProtected")}</span>
                            </span>
                        ) : (
                            <span>-</span>
                        )}
                    </div>
                );
            }
        },
        {
            accessorKey: "enabled",
            header: t("enabled"),
            cell: ({ row }) => (
                <Switch
                    defaultChecked={
                        row.original.http
                            ? !!row.original.domainId && row.original.enabled
                            : row.original.enabled
                    }
                    disabled={
                        row.original.http ? !row.original.domainId : false
                    }
                    onCheckedChange={(val) =>
                        toggleResourceEnabled(val, row.original.id)
                    }
                />
            )
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <div className="flex items-center justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">
                                        {t("openMenu")}
                                    </span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <Link
                                    className="block w-full"
                                    href={`/${resourceRow.orgId}/settings/resources/${resourceRow.id}`}
                                >
                                    <DropdownMenuItem>
                                        {t("viewSettings")}
                                    </DropdownMenuItem>
                                </Link>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSelectedResource(resourceRow);
                                        setIsDeleteModalOpen(true);
                                    }}
                                >
                                    <span className="text-red-500">
                                        {t("delete")}
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Link
                            href={`/${resourceRow.orgId}/settings/resources/${resourceRow.id}`}
                        >
                            <Button
                                variant={"secondary"}
                                className="ml-2"
                                size="sm"
                            >
                                {t("edit")}
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </Link>
                    </div>
                );
            }
        }
    ];



    const proxyTable = useReactTable({
        data: resources,
        columns: proxyColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setProxySorting,
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: setProxyColumnFilters,
        getFilteredRowModel: getFilteredRowModel(),
        onGlobalFilterChange: setProxyGlobalFilter,
        initialState: {
            pagination: {
                pageSize: proxyPageSize,
                pageIndex: 0
            }
        },
        state: {
            sorting: proxySorting,
            columnFilters: proxyColumnFilters,
            globalFilter: proxyGlobalFilter
        }
    });



    const handleProxyPageSizeChange = (newPageSize: number) => {
        setProxyPageSize(newPageSize);
        setStoredPageSize(newPageSize, 'site-resources');
    };

    return (
        <div>
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
                                    selectedResource:
                                        selectedResource?.name ||
                                        selectedResource?.id
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
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            Site Resources
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            List of all resources connected to this site.
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>

                    <SettingsSectionBody>

                        <div className="container mx-auto max-w-12xl">
                            <Card>
                                <CardContent>
                                    {proxyTable.getRowModel().rows?.length ? (
                                        <>
                                            <Table>
                                                <TableHeader>
                                                    {proxyTable.getHeaderGroups().map((headerGroup) => (
                                                        <TableRow key={headerGroup.id}>
                                                            {headerGroup.headers.map((header) => (
                                                                <TableHead key={header.id}>
                                                                    {header.isPlaceholder
                                                                        ? null
                                                                        : flexRender(
                                                                            header.column.columnDef.header,
                                                                            header.getContext()
                                                                        )}
                                                                </TableHead>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                </TableHeader>
                                                <TableBody>
                                                    {proxyTable.getRowModel().rows.map((row) => (
                                                        <TableRow
                                                            key={row.id}
                                                            data-state={row.getIsSelected() && "selected"}
                                                        >
                                                            {row.getVisibleCells().map((cell) => (
                                                                <TableCell key={cell.id}>
                                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>

                                            <div className="mt-4">
                                                <DataTablePagination
                                                    table={proxyTable}
                                                    onPageSizeChange={handleProxyPageSizeChange}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                            <Server className="h-12 w-12 mb-4 opacity-50" />
                                            <p className="mb-2">No resources found for this site</p>
                                            <p className="text-sm mb-4">
                                                Create resources to proxy traffic through this site
                                            </p>
                                            <Link href={`/${orgId}/settings/resources/create`}>
                                                <Button>
                                                    Create First Resource
                                                    <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </SettingsSectionBody>
                </SettingsSection>
            </SettingsContainer>
        </div>
    );
}