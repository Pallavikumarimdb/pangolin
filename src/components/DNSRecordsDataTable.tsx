"use client";

import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    getSortedRowModel,
    getFilteredRowModel
} from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Button } from "@app/components/ui/button";
import { useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@app/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useTranslations } from "next-intl";
import { Badge } from "./ui/badge";


type TabFilter = {
    id: string;
    label: string;
    filterFn: (row: any) => boolean;
};

type DNSRecordsDataTableProps<TData, TValue> = {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    title?: string;
    addButtonText?: string;
    onAdd?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    searchPlaceholder?: string;
    searchColumn?: string;
    defaultSort?: {
        id: string;
        desc: boolean;
    };
    tabs?: TabFilter[];
    defaultTab?: string;
    persistPageSize?: boolean | string;
    defaultPageSize?: number;
};

export function DNSRecordsDataTable<TData, TValue>({
    columns,
    data,
    title,
    addButtonText,
    onAdd,
    onRefresh,
    isRefreshing,
    defaultSort,
    tabs,
    defaultTab,

}: DNSRecordsDataTableProps<TData, TValue>) {
    const t = useTranslations();

    const [activeTab, setActiveTab] = useState<string>(
        defaultTab || tabs?.[0]?.id || ""
    );

    // Apply tab filter to data
    const filteredData = useMemo(() => {
        if (!tabs || activeTab === "") {
            return data;
        }

        const activeTabFilter = tabs.find((tab) => tab.id === activeTab);
        if (!activeTabFilter) {
            return data;
        }

        return data.filter(activeTabFilter.filterFn);
    }, [data, tabs, activeTab]);

    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),

        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });




    return (
        <div className="container mx-auto max-w-12xl">
            <Card>
                <CardHeader className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-4">
                    <div className="flex flex-row space-y-3 w-full sm:mr-2 gap-2">
                        <div className="relative w-full sm:max-w-sm flex flex-row gap-10 items-center">
                            <h1 className="">DNS Records</h1>
                            <Badge variant="secondary">Required</Badge>
                        </div>
                        {tabs && tabs.length > 0 && (
                            <Tabs
                                value={activeTab}
                                className="w-full"
                            >
                                <TabsList>
                                    {tabs.map((tab) => (
                                        <TabsTrigger
                                            key={tab.id}
                                            value={tab.id}
                                        >
                                            {tab.label} (
                                            {data.filter(tab.filterFn).length})
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                        )}
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                        {onRefresh && (
                            <Button
                                variant="outline"
                                onClick={onRefresh}
                                disabled={isRefreshing}
                            >
                                <RefreshCw
                                    className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                                />
                                {t("refresh")}
                            </Button>
                        )}
                        {onAdd && addButtonText && (
                            <Button onClick={onAdd}>
                                <Plus className="mr-2 h-4 w-4" />
                                {addButtonText}
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
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
                                    <TableRow
                                        key={row.id}
                                        data-state={
                                            row.getIsSelected() && "selected"
                                        }
                                    >
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
                                        No results found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
