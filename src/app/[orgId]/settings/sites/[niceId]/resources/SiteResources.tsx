'use client';

import { Button } from "@app/components/ui/button";
import Link from "next/link";
import { ArrowRight, Server } from "lucide-react";

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

export default function SiteResourcesSummary({
    siteId,
    resources,
    siteNiceId,
    orgId,
}: SiteResourcesSummaryProps) {

    const resourceCount = resources.length;

    return (
        <div>

            {resourceCount === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">No resources found for this site</p>
                    <p className="text-sm mb-4">Create resources to proxy traffic through this site</p>
                    <Link href={`/${orgId}/settings/resources/create`}>
                        <Button>
                            Create First Resource
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            )}

        </div>
    );
}