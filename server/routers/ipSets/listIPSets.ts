import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { ipSets } from "@server/db";
import { eq, sql } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const listIPSetsParamsSchema = z.object({
    orgId: z.string().min(1, "Organization ID is required")
});

const listIPSetsQuerySchema = z.object({
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

export type ListIPSetsResponse = {
    ipSets: Array<{
        id: string;
        name: string;
        orgId: string;
        description?: string | null;
        ips: string[];
        createdAt: string;
        updatedAt: string;
    }>;
    pagination: { total: number; limit: number; offset: number };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/ip-sets",
    description: "List all IP sets for an organization.",
    tags: [OpenAPITags.IPSet],
    request: {
        params: listIPSetsParamsSchema,
        query: listIPSetsQuerySchema
    },
    responses: {}
});

export async function listIPSets(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listIPSetsParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedQuery = listIPSetsQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;
        const { limit, offset } = parsedQuery.data;

        let ipSetsQuery = db
            .select()
            .from(ipSets)
            .where(eq(ipSets.orgId, orgId))
            .limit(limit)
            .offset(offset)
            .orderBy(ipSets.createdAt);



        const ipSetsList = await ipSetsQuery;

        let countQuery = db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(ipSets)
            .where(eq(ipSets.orgId, orgId));

        const totalCount = await countQuery;

        // Transform the response to include parsed IPs
        const transformedIPSets = ipSetsList.map((set: any) => ({
            ...set,
            ips: JSON.parse(set.ips),
            createdAt: set.createdAt.toISOString(),
            updatedAt: set.updatedAt.toISOString()
        }));

        return response<ListIPSetsResponse>(res, {
            data: {
                ipSets: transformedIPSets,
                pagination: {
                    total: totalCount[0].count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "IP sets retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}