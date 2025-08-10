// createResourceRule.ts - Complete fixed version
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

const createResourceRuleSchema = z
    .object({
        action: z.enum(["ACCEPT", "DROP"]),
        match: z.enum(["CIDR", "IP", "PATH", "IP_SET", "IP_CIDR"]),
        value: z.string().min(1),
        priority: z.number().int(),
        enabled: z.boolean().optional(),
        ipSetId: z.union([
            z.string().uuid(),
            z.literal(""),
            z.null(),
            z.undefined()
        ]).transform(val => {
            if (val === "" || val === undefined) return null;
            return val;
        }).optional()
    })
    .strict()
    .refine((data) => {
        if (data.match === "IP_SET") {
            return data.ipSetId !== null && data.ipSetId !== undefined && data.ipSetId.length > 0;
        }
        return true;
    }, {
        message: "ipSetId is required when match type is IP_SET"
    });

const createResourceRuleParamsSchema = z
    .object({
        resourceId: z
            .string()
            .transform(Number)
            .pipe(z.number().int().positive())
    })
    .strict();

registry.registerPath({
    method: "put",
    path: "/resource/{resourceId}/rule",
    description: "Create a resource rule with enhanced IP handling and IP set support.",
    tags: [OpenAPITags.Resource, OpenAPITags.Rule],
    request: {
        params: createResourceRuleParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: createResourceRuleSchema
                }
            }
        }
    },
    responses: {}
});

export async function createResourceRule(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = createResourceRuleSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        let { action, match, value, priority, enabled, ipSetId } = parsedBody.data;

        const parsedParams = createResourceRuleParamsSchema.safeParse(
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

        const { resourceId } = parsedParams.data;

        // Verify that the referenced resource exists
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

        if (!resource.http && (match === "PATH" || match === "IP_SET")) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Cannot create PATH or IP_SET rules for non-http resource"
                )
            );
        }

        let finalMatch = match;
        let finalValue = value;
        let finalIpSetId = ipSetId;

        if (match === "IP_SET") {
            if (!ipSetId) {
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
                .where(eq(ipSets.id, ipSetId))
                .limit(1);

            if (!ipSet) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `IP Set with ID ${ipSetId} not found`
                    )
                );
            }

            finalValue = ipSetId; 
        } else if (match === "IP_CIDR") {
            const normalized = normalizeIPValue(value);
            finalMatch = normalized.finalMatch;
            finalValue = normalized.normalizedValue;
            finalIpSetId = null;
        } else if (match === "CIDR") {
            if (!isValidCIDR(value)) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Invalid CIDR provided"
                    )
                );
            }
            finalIpSetId = null;
        } else if (match === "IP") {
            if (!isValidIP(value)) {
                return next(
                    createHttpError(HttpCode.BAD_REQUEST, "Invalid IP provided")
                );
            }
            finalIpSetId = null;
        } else if (match === "PATH") {
            if (!isValidUrlGlobPattern(value)) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Invalid URL glob pattern provided"
                    )
                );
            }
            finalIpSetId = null;
        }

        // Create the new resource rule
        const [newRule] = await db
            .insert(resourceRules)
            .values({
                resourceId,
                action,
                match: finalMatch,
                value: finalValue,
                priority,
                enabled: enabled ?? true,
                ipSetId: finalIpSetId
            })
            .returning();

        return response(res, {
            data: newRule,
            success: true,
            error: false,
            message: "Resource rule created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}