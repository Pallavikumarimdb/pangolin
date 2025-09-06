import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resources, targets, sites, domains } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { eq, and, count } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";

const listSiteResourcesParamsSchema = z
    .object({
        siteId: z.string().transform(Number).pipe(z.number().int().positive()),
        orgId: z.string()
    })
    .strict();

const listSiteResourcesQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .default("100")
        .transform(Number)
        .pipe(z.number().int().positive()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.number().int().nonnegative())
});

// Query function to get resources for a specific site
function querySiteResources(siteId: number, orgId: string) {
    return db
        .select({
            resourceId: resources.resourceId,
            name: resources.name,
            orgId: resources.orgId,
            niceId: resources.niceId,
            subdomain: resources.subdomain,
            fullDomain: resources.fullDomain,
            domainId: resources.domainId,
            ssl: resources.ssl,
            blockAccess: resources.blockAccess,
            sso: resources.sso,
            http: resources.http,
            protocol: resources.protocol,
            proxyPort: resources.proxyPort,
            emailWhitelistEnabled: resources.emailWhitelistEnabled,
            applyRules: resources.applyRules,
            enabled: resources.enabled,
            stickySession: resources.stickySession,
            tlsServerName: resources.tlsServerName,
            setHostHeader: resources.setHostHeader,
            enableProxy: resources.enableProxy,
            skipToIdpId: resources.skipToIdpId,
            baseDomain: domains.baseDomain,
            configManaged: domains.configManaged,
            type: domains.type,
            verified: domains.verified,
            failed: domains.failed,
            tries: domains.tries,
            targetCount: count(targets.targetId),
        })
        .from(resources)
        .innerJoin(targets, eq(targets.resourceId, resources.resourceId))
        .innerJoin(sites, eq(sites.siteId, targets.siteId))
        .leftJoin(domains, eq(domains.domainId, resources.domainId))
        .where(
            and(
                eq(targets.siteId, siteId),
                eq(resources.orgId, orgId),
                eq(sites.orgId, orgId)
            )
        )
        .groupBy(
            resources.resourceId,
            resources.name,
            resources.orgId,
            resources.niceId,
            resources.subdomain,
            resources.fullDomain,
            resources.domainId,
            resources.ssl,
            resources.blockAccess,
            resources.sso,
            resources.http,
            resources.protocol,
            resources.proxyPort,
            resources.emailWhitelistEnabled,
            resources.applyRules,
            resources.enabled,
            resources.stickySession,
            resources.tlsServerName,
            resources.setHostHeader,
            resources.enableProxy,
            resources.skipToIdpId,
            domains.baseDomain,
            domains.configManaged,
            domains.type,
            domains.verified,
            domains.failed,
            domains.tries
        );

}

export type ListSiteResourcesResponse = {
    resources: Awaited<ReturnType<typeof querySiteResources>>;
    pagination: { total: number; limit: number; offset: number };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/site/{siteId}/proxy-resources",
    description: "List resources for a specific site.",
    tags: [OpenAPITags.Site, OpenAPITags.Org],
    request: {
        params: listSiteResourcesParamsSchema,
        query: listSiteResourcesQuerySchema
    },
    responses: {}
});

export async function listSiteProxyResources(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listSiteResourcesParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedQuery = listSiteResourcesQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const { siteId, orgId } = parsedParams.data;
        const { limit, offset } = parsedQuery.data;

        // Verify the site exists and belongs to the org
        const [site] = await db
            .select()
            .from(sites)
            .where(and(eq(sites.siteId, siteId), eq(sites.orgId, orgId)))
            .limit(1);

        if (!site) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "Site not found"
                )
            );
        }

        // Get resources for the site
        const baseQuery = querySiteResources(siteId, orgId);
        const resourcesList = await baseQuery.limit(limit).offset(offset);

        // Get total count
        const countQuery = db
            .select({ count: count() })
            .from(resources)
            .innerJoin(targets, eq(targets.resourceId, resources.resourceId))
            .innerJoin(sites, eq(sites.siteId, targets.siteId))
            .where(
                and(
                    eq(targets.siteId, siteId),
                    eq(resources.orgId, orgId),
                    eq(sites.orgId, orgId)
                )
            );

        const totalCountResult = await countQuery;
        const totalCount = totalCountResult[0].count;

        return response<ListSiteResourcesResponse>(res, {
            data: {
                resources: resourcesList,
                pagination: {
                    total: totalCount,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Site resources retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error listing site proxy resources:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to list site proxy resources"
            )
        );
    }
}