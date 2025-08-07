import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { 
    resources, 
    orgs, 
    userOrgs, 
    userResources, 
    roleResources
} from "@server/db";
import { eq, and, ne } from "drizzle-orm";
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


async function cleanupResourcePermissions(
    resourceId: number, 
    oldOrgId: string, 
    newOrgId: string, 
    movingUserId: string,
    tx: any
) {
    try {
        // remove all role-based permissions (roles belong to the old org)
        const deletedRoleResources = await tx
            .delete(roleResources)
            .where(eq(roleResources.resourceId, resourceId))
            .returning();

        // remove all user permissions except the moving user
        const deletedUserResources = await tx
            .delete(userResources)
            .where(and(
                eq(userResources.resourceId, resourceId),
                ne(userResources.userId, movingUserId)
            ))
            .returning();

        // Note: we preserve authentication settings (passwords, pins, whitelist, tokens)
        // as these are resource-specific and remain valid across orgs

        logger.info(`Permission cleanup for resource ${resourceId}:`, {
            resourceId,
            oldOrgId,
            newOrgId,
            movingUserId,
            deletedRolePermissions: deletedRoleResources.length,
            deletedUserPermissions: deletedUserResources.length
        });

        return {
            deletedRolePermissions: deletedRoleResources.length,
            deletedUserPermissions: deletedUserResources.length
        };
    } catch (error) {
        logger.error("Error during permission cleanup:", error);
        throw error;
    }
}

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

        // set req.userOrgId to source org so permissions are checked correctly
        req.userOrgId = resource.orgId;

        if (resource.orgId === orgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, `Resource is already in this organization`)
            );
        }

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


        // perform the move within a transaction
        const moveResult = await db.transaction(async (tx) => {
            // Move the resource to new org
            const [updatedResource] = await tx
                .update(resources)
                .set({ orgId })
                .where(eq(resources.resourceId, resourceId))
                .returning();

            if (!updatedResource) {
                throw new Error("Failed to update resource");
            }

            // Clean up permissions that become invalid
            const cleanupResult = await cleanupResourcePermissions(
                resourceId, 
                resource.orgId, 
                orgId, 
                user.userId,
                tx
            );

            // Grant access to moving user in new org (ensure they have access)
            await tx.insert(userResources)
                .values({
                    userId: user.userId,
                    resourceId
                })
                .onConflictDoNothing(); // In case they already have access somehow

            return {
                updatedResource,
                cleanupResult
            };
        });

        logger.info(`Resource ${resourceId} successfully moved`, {
            resourceId,
            resourceName: resource.name,
            oldOrgId: resource.orgId,
            newOrgId: orgId,
            movedByUserId: user.userId,
            impactSummary: {
                ...moveResult.cleanupResult
            }
        });

        return response(res, {
            data: {
                resourceId: moveResult.updatedResource.resourceId,
                resourceName: moveResult.updatedResource.name,
                oldOrgId: resource.orgId,
                newOrgId: orgId,
                targetOrgName: targetOrg.name,
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