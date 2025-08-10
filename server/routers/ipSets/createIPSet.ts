import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { ipSets } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { isValidCIDR, isValidIP } from "@server/lib/validators";
import { OpenAPITags, registry } from "@server/openApi";
import { v4 as uuidv4 } from "uuid";
import { eq, and } from "drizzle-orm";

const createIPSetSchema = z
    .object({
        name: z.string().min(1, "Name is required").max(100),
        description: z.string().optional(),
        ips: z.array(z.string()).min(1, "At least one IP is required")
    })
    .strict();

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/ip-sets",
    description: "Create a new IP set.",
    tags: [OpenAPITags.IPSet],
    request: {
        body: {
            content: {
                "application/json": {
                    schema: createIPSetSchema
                }
            }
        }
    },
    responses: {}
});

export async function createIPSet(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const orgId = req.params.orgId;
        if (!orgId) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Organization ID is required"
                )
            );
        }

        const parsedBody = createIPSetSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { name, description, ips } = parsedBody.data;

        // Validate all IPs
        for (const ip of ips) {
            if (!isValidIP(ip) && !isValidCIDR(ip)) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        `Invalid IP address or CIDR range: ${ip}`
                    )
                );
            }
        }

        // Check if name already exists within this organization
        const existingSet = await db
            .select()
            .from(ipSets)
            .where(eq(ipSets.name, name))
            .limit(1);

        if (existingSet.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    `IP set with name "${name}" already exists`
                )
            );
        }

        const [newIPSet] = await db
            .insert(ipSets)
            .values({
                id: uuidv4(),
                name,
                description,
                orgId: orgId,
                ips: JSON.stringify(ips),
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        // Transform the response to include parsed IPs
        const responseData = {
            ...newIPSet,
            ips: JSON.parse(newIPSet.ips)
        };

        return response(res, {
            data: responseData,
            success: true,
            error: false,
            message: "IP set created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}