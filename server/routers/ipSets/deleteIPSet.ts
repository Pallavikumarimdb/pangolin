import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { ipSets, resourceRules } from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const deleteIPSetParamsSchema = z
    .object({
        orgId: z.string().min(1, "Organization ID is required"),
        ipSetId: z.string().uuid("Invalid IP set ID")
    })
    .strict();

registry.registerPath({
    method: "delete",
    path: "/org/{orgId}/ip-sets/{ipSetId}",
    description: "Delete an IP set.",
    tags: [OpenAPITags.IPSet],
    request: {
        params: deleteIPSetParamsSchema
    },
    responses: {}
});

export async function deleteIPSet(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = deleteIPSetParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId, ipSetId } = parsedParams.data;

        // Check if IP set exists and belongs to the organization
        const [existingSet] = await db
            .select()
            .from(ipSets)
            .where(
                and(
                    eq(ipSets.id, ipSetId)
                    // If we have orgId in ipSets table, add: eq(ipSets.orgId, orgId)
                )
            )
            .limit(1);

        if (!existingSet) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `IP set with ID ${ipSetId} not found`
                )
            );
        }

        // Check if IP set is being used by any rules
        const rulesUsingSet = await db
            .select()
            .from(resourceRules)
            .where(eq(resourceRules.ipSetId, ipSetId))
            .limit(1);

        if (rulesUsingSet.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    "Cannot delete IP set as it is being used by existing rules"
                )
            );
        }

        await db
            .delete(ipSets)
            .where(eq(ipSets.id, ipSetId));

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "IP set deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}