"use client";

import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    SortingState,
    getSortedRowModel,
    ColumnFiltersState,
    getFilteredRowModel,
    VisibilityState,
    Column
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
import { useEffect, useMemo, useState } from "react";
import { Input } from "@app/components/ui/input";
import { DataTablePagination } from "@app/components/DataTablePagination";
import { Plus, Search, RefreshCw, Settings2 } from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@app/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useTranslations } from "next-intl";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";

const STORAGE_KEYS = {
    PAGE_SIZE: 'datatable-page-size',
    getTablePageSize: (tableId?: string) => 
        tableId ? `${tableId}-size` : STORAGE_KEYS.PAGE_SIZE
};

const getStoredPageSize = (tableId?: string, defaultSize = 20): number => {
    if (typeof window === 'undefined') return defaultSize;
    
    try {
        const key = STORAGE_KEYS.getTablePageSize(tableId);
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = parseInt(stored, 10);
            // Validate that it's a reasonable page size
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

type TabFilter = {
    id: string;
    label: string;
    filterFn: (row: any) => boolean;
};

type DataTableProps<TData, TValue> = {
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
    enableColumnToggle?: boolean;
};

export function DataTable<TData, TValue>({
    columns,
    data,
    title,
    addButtonText,
    onAdd,
    onRefresh,
    isRefreshing,
    searchPlaceholder = "Search...",
    searchColumn = "name",
    defaultSort,
    tabs,
    defaultTab,
    persistPageSize = false,
    defaultPageSize = 20,
    enableColumnToggle = true
}: DataTableProps<TData, TValue>) {
    const t = useTranslations();
    
    // Determine table identifier for storage
    const tableId = typeof persistPageSize === 'string' ? persistPageSize : undefined;
    
    // Initialize page size from storage or default
    const [pageSize, setPageSize] = useState<number>(() => {
        if (persistPageSize) {
            return getStoredPageSize(tableId, defaultPageSize);
        }
        return defaultPageSize;
    });
    
    const [sorting, setSorting] = useState<SortingState>(
        defaultSort ? [defaultSort] : []
    );
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState<any>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
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
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: setColumnFilters,
        getFilteredRowModel: getFilteredRowModel(),
        onGlobalFilterChange: setGlobalFilter,
        onColumnVisibilityChange: setColumnVisibility,
        initialState: {
            pagination: {
                pageSize: pageSize,
                pageIndex: 0
            }
        },
        state: {
            sorting,
            columnFilters,
            globalFilter,
            columnVisibility
        }
    });

    useEffect(() => {
        const currentPageSize = table.getState().pagination.pageSize;
        if (currentPageSize !== pageSize) {
            table.setPageSize(pageSize);
            
            // Persist to localStorage if enabled
            if (persistPageSize) {
                setStoredPageSize(pageSize, tableId);
            }
        }
    }, [pageSize, table, persistPageSize, tableId]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        // Reset to first page when changing tabs
        table.setPageIndex(0);
    };

    // Enhanced pagination component that updates our local state
    const handlePageSizeChange = (newPageSize: number) => {
        setPageSize(newPageSize);
        table.setPageSize(newPageSize);
        
        // Persist immediately when changed
        if (persistPageSize) {
            setStoredPageSize(newPageSize, tableId);
        }
    };

    const getColumnLabel = (column: Column<any, any>) => {
        return typeof column.columnDef.header === "string" ? 
        column.columnDef.header : 
        column.id; // fallback to id if header is JSX
    };


    const renderColumnToggle = () => {
        if (!enableColumnToggle) return null;

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                        <Settings2 className="mr-2 h-4 w-4" />
                        {t("columns")}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {table.getAllColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => (
                            <DropdownMenuCheckboxItem
                                key={column.id}
                                className="capitalize"
                                checked={column.getIsVisible()}
                                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                            >
                                {getColumnLabel(column)}
                            </DropdownMenuCheckboxItem>
                        ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };


    return (
        <div className="container mx-auto max-w-12xl">
            <Card>
                <CardHeader className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-4">
                    <div className="flex flex-row space-y-3 w-full sm:mr-2 gap-2">
                        <div className="relative w-full sm:max-w-sm">
                            <Input
                                placeholder={searchPlaceholder}
                                value={globalFilter ?? ""}
                                onChange={(e) =>
                                    table.setGlobalFilter(
                                        String(e.target.value)
                                    )
                                }
                                className="w-full pl-8"
                            />
                            <Search className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                        </div>
                        {tabs && tabs.length > 0 && (
                            <Tabs
                                value={activeTab}
                                onValueChange={handleTabChange}
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
                    <div className="mt-4">
                        <DataTablePagination 
                            table={table} 
                            onPageSizeChange={handlePageSizeChange}
                            renderAdditionalControls={renderColumnToggle}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
