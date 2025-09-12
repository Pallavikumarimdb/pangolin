import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resources, targets, sites } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { eq, and, count } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";

const listSiteTargetsParamsSchema = z
    .object({
        siteId: z.string().transform(Number).pipe(z.number().int().positive()),
        orgId: z.string()
    })
    .strict();

const listSiteTargetsQuerySchema = z.object({
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


function querySiteTargets(siteId: number, orgId: string) {
    return db
        .select({
            targetId: targets.targetId,
            resourceId: targets.resourceId,
            siteId: targets.siteId,
            ip: targets.ip,
            method: targets.method,
            port: targets.port,
            internalPort: targets.internalPort,
            enabled: targets.enabled,
            resourceName: resources.name,
            resourceNiceId: resources.niceId,
            protocol: resources.protocol,
        })
        .from(targets)
        .innerJoin(resources, eq(resources.resourceId, targets.resourceId))
        .innerJoin(sites, eq(sites.siteId, targets.siteId))
        .where(
            and(
                eq(targets.siteId, siteId),
                eq(resources.orgId, orgId),
                eq(sites.orgId, orgId)
            )
        );
}

export type ListSiteTargetsResponse = {
    targets: Awaited<ReturnType<typeof querySiteTargets>>;
    pagination: { total: number; limit: number; offset: number };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/site/{siteId}/targets",
    description: "List targets for a specific site.",
    tags: [OpenAPITags.Site, OpenAPITags.Org],
    request: {
        params: listSiteTargetsParamsSchema,
        query: listSiteTargetsQuerySchema
    },
    responses: {}
});

export async function listSiteTargets(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listSiteTargetsParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedQuery = listSiteTargetsQuerySchema.safeParse(req.query);
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


        const baseQuery = querySiteTargets(siteId, orgId);
        const targetsList = await baseQuery.limit(limit).offset(offset);

        // Get total count
        const countQuery = db
            .select({ count: count() })
            .from(targets)
            .innerJoin(resources, eq(resources.resourceId, targets.resourceId))
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

        return response<ListSiteTargetsResponse>(res, {
            data: {
                targets: targetsList,
                pagination: {
                    total: totalCount,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Site targets retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error listing site targets:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to list site targets"
            )
        );
    }
}