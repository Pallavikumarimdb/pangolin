import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resources, orgs, userOrgs, userResources  } from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { registry, OpenAPITags } from "@server/openApi";

const moveResourceParamsSchema = z.object({
    resourceId: z.string().transform(Number).pipe(z.number().int().positive()),
});

const moveResourceBodySchema = z.object({
    orgId: z.string().min(1)
});


registry.registerPath({
    method: "post",
    path: "/resource/{resourceId}/move-org",
    description: "Move a resource to a different org",
    tags: [OpenAPITags.Resource],
    request: {
        params: moveResourceParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: moveResourceBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function moveResourceToOrg(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const parsedParams = moveResourceParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(createHttpError(HttpCode.BAD_REQUEST, fromError(parsedParams.error).toString()));
        }

        const parsedBody = moveResourceBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(createHttpError(HttpCode.BAD_REQUEST, fromError(parsedBody.error).toString()));
        }

        const { resourceId } = parsedParams.data;
        const { orgId } = parsedBody.data;
        const user = req.user;

        if (!user) {
            return next(createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated"));
        }

        // Step 1: Fetch resource
        const [resource] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Resource with ID ${resourceId} not found`)
            );
        }

        // Step 2: Set req.userOrgId to source org so permissions are checked correctly
        req.userOrgId = resource.orgId;

        // Step 3: Prevent move to same org
        if (resource.orgId === orgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, `Resource is already in this organization`)
            );
        }

        // Step 4: Check if target org exists
        const [targetOrg] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (!targetOrg) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Target organization with ID ${orgId} not found`)
            );
        }

        // Step 5: Verify user has access to target organization
        const [userOrgAccess] = await db
            .select()
            .from(userOrgs)
            .where(and(
                eq(userOrgs.userId, user.userId),
                eq(userOrgs.orgId, orgId)
            ))
            .limit(1);

        if (!userOrgAccess) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, `You don't have access to the target organization`)
            );
        }

        // Step 6: Move the resource
        const [updatedResource] = await db
            .update(resources)
            .set({
                orgId
            })
            .where(eq(resources.resourceId, resourceId))
            .returning();

        await db.insert(userResources).values({
            userId: req.user!.userId,
            resourceId
        });


        if (!updatedResource) {
            return next(
                createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "Failed to update resource")
            );
        }

        // Log the successful move
        logger.info(`Resource ${resourceId} moved from org ${resource.orgId} to org ${orgId} by user ${user.userId}`);

        // Step 7: Respond
        return response(res, {
            data: {
                resourceId: updatedResource.resourceId,
                oldOrgId: resource.orgId,
                newOrgId: orgId,
                name: updatedResource.name
            },
            success: true,
            error: false,
            message: "Resource successfully moved to new organization",
            status: HttpCode.OK,
        });
    } catch (err) {
        logger.error("Error moving resource to org:", err);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred while moving the resource")
        );
    }
}