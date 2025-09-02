import {
    ChevronLeftIcon,
    ChevronRightIcon,
    DoubleArrowLeftIcon,
    DoubleArrowRightIcon
} from "@radix-ui/react-icons";
import { Table } from "@tanstack/react-table";

import { Button } from "@app/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { useTranslations } from "next-intl";

interface DataTablePaginationProps<TData> {
    table: Table<TData>;
    onPageSizeChange?: (pageSize: number) => void;
    renderAdditionalControls?: () => React.ReactNode;
}

export function DataTablePagination<TData>({
    table,
    onPageSizeChange,
    renderAdditionalControls
}: DataTablePaginationProps<TData>) {
    const t = useTranslations();

    const handlePageSizeChange = (value: string) => {
        const newPageSize = Number(value);
        table.setPageSize(newPageSize);
        
        // Call the callback if provided (for persistence)
        if (onPageSizeChange) {
            onPageSizeChange(newPageSize);
        }
    };

    return (
        <div className="flex items-center justify-between text-muted-foreground">
            <div className="flex items-center space-x-2">
                <Select
                    value={`${table.getState().pagination.pageSize}`}
                    onValueChange={handlePageSizeChange}
                >
                    <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue
                            placeholder={table.getState().pagination.pageSize}
                        />
                    </SelectTrigger>
                    <SelectContent side="bottom">
                        {[10, 20, 30, 40, 50, 100].map((pageSize) => (
                            <SelectItem key={pageSize} value={`${pageSize}`}>
                                {pageSize}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {renderAdditionalControls && (
                    <div className="flex items-center space-x-2">
                        {renderAdditionalControls()}
                    </div>
                )}
            </div>

            <div className="flex items-center space-x-3 lg:space-x-8">
                <div className="flex items-center justify-center text-sm font-medium">
                    {t('paginator', {current: table.getState().pagination.pageIndex + 1, last: table.getPageCount()})}
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        className="hidden h-8 w-8 p-0 lg:flex"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">{t('paginatorToFirst')}</span>
                        <DoubleArrowLeftIcon className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">{t('paginatorToPrevious')}</span>
                        <ChevronLeftIcon className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">{t('paginatorToNext')}</span>
                        <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        className="hidden h-8 w-8 p-0 lg:flex"
                        onClick={() =>
                            table.setPageIndex(table.getPageCount() - 1)
                        }
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">{t('paginatorToLast')}</span>
                        <DoubleArrowRightIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
