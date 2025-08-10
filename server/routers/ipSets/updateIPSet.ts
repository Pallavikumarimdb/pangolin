import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { ipSets } from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { isValidCIDR, isValidIP } from "@server/lib/validators";
import { OpenAPITags, registry } from "@server/openApi";

const updateIPSetParamsSchema = z
    .object({
        orgId: z.string().min(1, "Organization ID is required"),
        ipSetId: z.string().uuid("Invalid IP set ID")
    })
    .strict();

const updateIPSetSchema = z
    .object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        ips: z.array(z.string()).min(1).optional()
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    });

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/ip-sets/{ipSetId}",
    description: "Update an IP set.",
    tags: [OpenAPITags.IPSet],
    request: {
        params: updateIPSetParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateIPSetSchema
                }
            }
        }
    },
    responses: {}
});

export async function updateIPSet(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = updateIPSetParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = updateIPSetSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { orgId, ipSetId } = parsedParams.data;
        const updateData = parsedBody.data;

        // Check if IP set exists and belongs to the organization
        const [existingSet] = await db
            .select()
            .from(ipSets)
            .where(
                and(
                    eq(ipSets.id, ipSetId),
                    eq(ipSets.orgId, orgId)
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

        // Validate IPs if provided
        if (updateData.ips) {
            for (const ip of updateData.ips) {
                if (!isValidIP(ip) && !isValidCIDR(ip)) {
                    return next(
                        createHttpError(
                            HttpCode.BAD_REQUEST,
                            `Invalid IP address or CIDR range: ${ip}`
                        )
                    );
                }
            }
        }

        // Check if name is unique (if being updated)
        if (updateData.name && updateData.name !== existingSet.name) {
            let nameExistsQuery = db
                .select()
                .from(ipSets)
                .where(eq(ipSets.name, updateData.name))
                .limit(1);


            const nameExists = await nameExistsQuery;

            if (nameExists.length > 0) {
                return next(
                    createHttpError(
                        HttpCode.CONFLICT,
                        `IP set with name "${updateData.name}" already exists`
                    )
                );
            }
        }

        // Prepare update data
        const updateFields: any = {
            ...updateData,
            updatedAt: new Date()
        };

        if (updateData.ips) {
            updateFields.ips = JSON.stringify(updateData.ips);
        }

        // Update the IP set
        const [updatedSet] = await db
            .update(ipSets)
            .set(updateFields)
            .where(eq(ipSets.id, ipSetId))
            .returning();

        // Transform the response
        const responseData = {
            ...updatedSet,
            ips: JSON.parse(updatedSet.ips),
            createdAt: updatedSet.createdAt.toISOString(),
            updatedAt: updatedSet.updatedAt.toISOString()
        };

        return response(res, {
            data: responseData,
            success: true,
            error: false,
            message: "IP set updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}