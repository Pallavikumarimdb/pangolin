import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resourceRules, resources, ipSets } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import {
    isValidCIDR,
    isValidIP,
    isValidUrlGlobPattern
} from "@server/lib/validators";
import { OpenAPITags, registry } from "@server/openApi";


function normalizeIPValue(value: string): { normalizedValue: string; finalMatch: "IP" | "CIDR" } {
    if (isValidIP(value)) {
        // Auto-convert single IP to CIDR
        const cidrValue = value.includes(':') ? `${value}/128` : `${value}/32`;
        return { normalizedValue: cidrValue, finalMatch: "CIDR" };
    } else if (isValidCIDR(value)) {
        return { normalizedValue: value, finalMatch: "CIDR" };
    }
    return { normalizedValue: value, finalMatch: "IP" };
}

const updateResourceRuleParamsSchema = z
    .object({
        ruleId: z.string().transform(Number).pipe(z.number().int().positive()),
        resourceId: z
            .string()
            .transform(Number)
            .pipe(z.number().int().positive())
    })
    .strict();

// Define Zod schema for request body validation
const updateResourceRuleSchema = z
    .object({
        action: z.enum(["ACCEPT", "DROP"]).optional(),
        match: z.enum(["CIDR", "IP", "PATH", "IP_SET", "IP_CIDR"]).optional(),
        value: z.string().min(1).optional(),
        priority: z.number().int().optional(),
        enabled: z.boolean().optional(),
        ipSetId: z.string().uuid().nullable().optional().or(z.literal(""))
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    })
    .refine((data) => {
        if (data.match === "IP_SET") {
            return data.ipSetId && data.ipSetId.length > 0;
        }
        return true;
    }, {
        message: "ipSetId is required when match type is IP_SET"
    });

registry.registerPath({
    method: "post",
    path: "/resource/{resourceId}/rule/{ruleId}",
    description: "Update a resource rule with enhanced IP handling and IP set support.",
    tags: [OpenAPITags.Resource, OpenAPITags.Rule],
    request: {
        params: updateResourceRuleParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateResourceRuleSchema
                }
            }
        }
    },
    responses: {}
});

export async function updateResourceRule(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        // Validate path parameters
        const parsedParams = updateResourceRuleParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        // Validate request body
        const parsedBody = updateResourceRuleSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { ruleId, resourceId } = parsedParams.data;
        let updateData = parsedBody.data;

        // Verify that the resource exists
        const [resource] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        if (!resource.http && (updateData.match === "PATH" || updateData.match === "IP_SET")) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Cannot create PATH or IP_SET rules for non-http resource"
                )
            );
        }

        // Verify that the rule exists and belongs to the specified resource
        const [existingRule] = await db
            .select()
            .from(resourceRules)
            .where(eq(resourceRules.ruleId, ruleId))
            .limit(1);

        if (!existingRule) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource rule with ID ${ruleId} not found`
                )
            );
        }

        if (existingRule.resourceId !== resourceId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    `Resource rule ${ruleId} does not belong to resource ${resourceId}`
                )
            );
        }

        // Process match type and value updates
        const finalMatch = updateData.match || existingRule.match;
        let finalUpdateData = { ...updateData };

        if (updateData.match === "IP_SET") {
            if (!updateData.ipSetId) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "IP Set ID is required for IP_SET match type"
                    )
                );
            }

            const [ipSet] = await db
                .select()
                .from(ipSets)
                .where(eq(ipSets.id, updateData.ipSetId))
                .limit(1);

            if (!ipSet) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `IP Set with ID ${updateData.ipSetId} not found`
                    )
                );
            }

            finalUpdateData.value = updateData.ipSetId;
        } else if (updateData.match === "IP_CIDR" && updateData.value) {
            // Handle unified IP/CIDR input
            const normalized = normalizeIPValue(updateData.value);
            finalUpdateData.match = normalized.finalMatch;
            finalUpdateData.value = normalized.normalizedValue;
            finalUpdateData.ipSetId = ""; // Clear IP set reference
        } else if (updateData.value !== undefined) {

            if (finalMatch === "CIDR") {
                if (!isValidCIDR(updateData.value)) {
                    return next(
                        createHttpError(
                            HttpCode.BAD_REQUEST,
                            "Invalid CIDR provided"
                        )
                    );
                }
            } else if (finalMatch === "IP") {
                if (!isValidIP(updateData.value)) {
                    return next(
                        createHttpError(
                            HttpCode.BAD_REQUEST,
                            "Invalid IP provided"
                        )
                    );
                }
            } else if (finalMatch === "PATH") {
                if (!isValidUrlGlobPattern(updateData.value)) {
                    return next(
                        createHttpError(
                            HttpCode.BAD_REQUEST,
                            "Invalid URL glob pattern provided"
                        )
                    );
                }
            }
            
            if (finalMatch !== "IP_SET") {
                finalUpdateData.ipSetId = "";
            }
        }

        const [updatedRule] = await db
            .update(resourceRules)
            .set(finalUpdateData)
            .where(eq(resourceRules.ruleId, ruleId))
            .returning();

        return response(res, {
            data: updatedRule,
            success: true,
            error: false,
            message: "Resource rule updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}