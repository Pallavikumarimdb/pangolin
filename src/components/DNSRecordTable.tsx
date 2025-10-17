"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@app/components/ui/button";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@app/hooks/useToast";
import { Badge } from "@app/components/ui/badge";
import CopyToClipboard from "@app/components/CopyToClipboard";
import { DNSRecordsDataTable } from "./DNSRecordsDataTable";

export type DNSRecordRow = {
    id: string;
    domainId: string;
    recordType: string; // "NS" | "CNAME" | "A" | "TXT"
    baseDomain: string | null;
    value: string;
    verified?: boolean; 
};

type Props = {
    records: DNSRecordRow[];
    domainId: string;
    isRefreshing?: boolean;
};

export default function DNSRecordsTable({ records, domainId, isRefreshing }: Props) {
    const t = useTranslations();

    const columns: ColumnDef<DNSRecordRow>[] = [
        {
            accessorKey: "baseDomain",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                    >
                        {t("recordName", { fallback: "Record name" })}
                    </Button>
                );
            },
            cell: ({ row }) => {
                const baseDomain = row.original.baseDomain;
                return (
                    <div className="font-mono text-sm">
                        {baseDomain || "-"}
                    </div>
                );
            }
        },
        {
            accessorKey: "recordType",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                    >
                        {t("type")}
                    </Button>
                );
            },
            cell: ({ row }) => {
                const type = row.original.recordType;
                return (
                    <div className="">
                        {type}
                    </div>
                );
            }
        },
        {
            accessorKey: "ttl",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                    >
                        {t("TTL")}
                    </Button>
                );
            },
            cell: ({ row }) => {
                return (
                    <div>
                        {t("auto")}
                    </div>
                );
            }
        },
        {
            accessorKey: "value",
            header: () => {
                return <div>{t("value")}</div>;
            },
            cell: ({ row }) => {
                const value = row.original.value;
                return (
                    <div className="flex items-center gap-2">
                        <div className="font-mono text-sm truncate max-w-md">
                            {value}
                        </div>
                    </div>
                );
            }
        },
        {
            accessorKey: "verified",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                    >
                        {t("status")}
                    </Button>
                );
            },
            cell: ({ row }) => {
                const verified = row.original.verified;
                return (
                    verified ? (
                        <Badge variant="green">{t("verified")}</Badge>
                    ) : (
                        <Badge variant="secondary">{t("unverified")}</Badge>
                    )
                );
            }
        }
    ];


    return (
        <DNSRecordsDataTable
            columns={columns}
            data={records}
            isRefreshing={isRefreshing}
        />
    );
}