import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import {
    resources,
    orgs,
    userOrgs,
    userResources,
    roleResources,
    targets,
    sites
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

type ResourceTarget = {
    targetId: number;
    siteId: number | null;
    siteOrgId: string | null;
    ip: string | null;
    port: number | null;
};

type DisconnectedTarget = {
    targetId: number;
    previousSiteId: number | null;
    ip: string | null;
    port: number | null;
};

type PermissionCleanupResult = {
    deletedRolePermissions: number;
    deletedUserPermissions: number;
};

type TargetCleanupResult = {
    targetsDisconnected: number;
    disconnectedTargets: DisconnectedTarget[];
};

type MoveResult = {
    updatedResource: any;
    permissionCleanup: PermissionCleanupResult;
    targetCleanup: TargetCleanupResult;
};

async function cleanupResourcePermissions(
    resourceId: number,
    oldOrgId: string,
    newOrgId: string,
    movingUserId: string,
    tx: any
): Promise<PermissionCleanupResult> {
    try {
        logger.info(`Starting permission cleanup for resource ${resourceId}`);

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

        const result = {
            deletedRolePermissions: deletedRoleResources.length,
            deletedUserPermissions: deletedUserResources.length
        };

        logger.info(`Permission cleanup completed for resource ${resourceId}:`, result);
        return result;
    } catch (error) {
        logger.error(`Error during permission cleanup for resource ${resourceId}:`, error);
        throw error;
    }
}

async function cleanupTargetSitesSafely(
    resourceId: number,
    targetOrgId: string,
    tx: any
): Promise<TargetCleanupResult> {
    try {
        logger.info(`Starting target cleanup for resource ${resourceId}`);

        // Get all targets for this resource with their site information
        const resourceTargets: ResourceTarget[] = await tx
            .select({
                targetId: targets.targetId,
                siteId: targets.siteId,
                siteOrgId: sites.orgId,
                ip: targets.ip,
                port: targets.port
            })
            .from(targets)
            .leftJoin(sites, eq(targets.siteId, sites.siteId))
            .where(eq(targets.resourceId, resourceId));

        // Find targets that reference sites from different orgs
        const problematicTargets = resourceTargets.filter(
            (target: ResourceTarget) => target.siteId && target.siteOrgId && target.siteOrgId !== targetOrgId
        );

        logger.info(`Found ${problematicTargets.length} targets with cross-org site references for resource ${resourceId}`);

        if (problematicTargets.length === 0) {
            return {
                targetsDisconnected: 0,
                disconnectedTargets: []
            };
        }

        // Strategy: Try to set siteId to null first, if that fails due to NOT NULL constraint, delete the targets
        const testTarget = problematicTargets[0];

        try {
            // Test if we can set siteId to null on the first target
            await tx
                .update(targets)
                .set({ siteId: null })
                .where(eq(targets.targetId, testTarget.targetId));

            // If successful, continue with the rest
            const disconnectedTargets: DisconnectedTarget[] = [{
                targetId: testTarget.targetId,
                previousSiteId: testTarget.siteId,
                ip: testTarget.ip,
                port: testTarget.port
            }];

            // Process remaining targets
            for (let i = 1; i < problematicTargets.length; i++) {
                const target = problematicTargets[i];
                await tx
                    .update(targets)
                    .set({ siteId: null })
                    .where(eq(targets.targetId, target.targetId));

                disconnectedTargets.push({
                    targetId: target.targetId,
                    previousSiteId: target.siteId,
                    ip: target.ip,
                    port: target.port
                });
            }

            logger.info(`Successfully disconnected ${disconnectedTargets.length} targets from sites`);

            return {
                targetsDisconnected: disconnectedTargets.length,
                disconnectedTargets
            };

        } catch (nullConstraintError) {
            // Rollback the test change and delete targets instead
            logger.warn(`Cannot set siteId to null due to schema constraints. Will delete problematic targets instead.`);

            // The test update failed, so we need to delete all problematic targets
            const deletedTargets: DisconnectedTarget[] = [];

            for (const target of problematicTargets) {
                const [deletedTarget] = await tx
                    .delete(targets)
                    .where(eq(targets.targetId, target.targetId))
                    .returning();

                if (deletedTarget) {
                    deletedTargets.push({
                        targetId: target.targetId,
                        previousSiteId: target.siteId,
                        ip: target.ip,
                        port: target.port
                    });
                }
            }

            logger.info(`Deleted ${deletedTargets.length} targets due to cross-org site references`);

            return {
                targetsDisconnected: deletedTargets.length,
                disconnectedTargets: deletedTargets
            };
        }

    } catch (error) {
        logger.error(`Error during target cleanup for resource ${resourceId}:`, error);
        throw error; // This will cause transaction rollback
    }
}

async function verifyResourceState(
    resourceId: number,
    expectedOrgId: string,
    context: string
): Promise<boolean> {
    try {
        const [verificationResource] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (verificationResource) {
            if (verificationResource.orgId === expectedOrgId) {
                logger.info(`✓ ${context}: Resource ${resourceId} is in expected org ${expectedOrgId}`);
                return true;
            } else {
                logger.error(`✗ ${context}: Resource ${resourceId} is in org ${verificationResource.orgId}, expected ${expectedOrgId}`);
                return false;
            }
        } else {
            logger.error(`✗ ${context}: Resource ${resourceId} not found`);
            return false;
        }
    } catch (error) {
        logger.error(`Failed to verify resource state for ${resourceId}:`, error);
        return false;
    }
}

async function emergencyRecovery(
    resourceId: number,
    originalOrgId: string
): Promise<void> {
    try {
        logger.warn(`Starting emergency recovery for resource ${resourceId}`);

        await db
            .update(resources)
            .set({ orgId: originalOrgId })
            .where(eq(resources.resourceId, resourceId));

        logger.info(`Emergency recovery completed: Resource ${resourceId} restored to org ${originalOrgId}`);
    } catch (error) {
        logger.error(`Emergency recovery failed for resource ${resourceId}:`, error);
        throw error;
    }
}

export async function moveResourceToOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    let originalResource: any = null;
    let resourceId: number = 0;
    let targetOrgId: string = '';

    try {
        const parsedParams = moveResourceParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(createHttpError(HttpCode.BAD_REQUEST, fromError(parsedParams.error).toString()));
        }

        const parsedBody = moveResourceBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(createHttpError(HttpCode.BAD_REQUEST, fromError(parsedBody.error).toString()));
        }

        resourceId = parsedParams.data.resourceId;
        targetOrgId = parsedBody.data.orgId;
        const user = req.user;

        if (!user) {
            return next(createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated"));
        }

        // Get and store original resource state before any modifications
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

        // Store original state for potential recovery
        originalResource = { ...resource };

        // Set req.userOrgId to source org so permissions are checked correctly
        req.userOrgId = resource.orgId;

        if (resource.orgId === targetOrgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, `Resource is already in this organization`)
            );
        }

        const [targetOrg] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, targetOrgId))
            .limit(1);

        if (!targetOrg) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Target organization with ID ${targetOrgId} not found`)
            );
        }

        const [userOrgAccess] = await db
            .select()
            .from(userOrgs)
            .where(and(
                eq(userOrgs.userId, user.userId),
                eq(userOrgs.orgId, targetOrgId)
            ))
            .limit(1);

        if (!userOrgAccess) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, `You don't have access to the target organization`)
            );
        }

        logger.info(`Starting resource move: ${resourceId} from ${resource.orgId} to ${targetOrgId}`);

        // Perform the move within a transaction with explicit rollback handling
        const moveResult: MoveResult = await db.transaction(async (tx) => {
            try {
                logger.info(`Transaction started for resource ${resourceId}`);

                const [updatedResource] = await tx
                    .update(resources)
                    .set({ orgId: targetOrgId })
                    .where(eq(resources.resourceId, resourceId))
                    .returning();

                if (!updatedResource) {
                    throw new Error("Failed to update resource orgId");
                }

                logger.info(`Resource ${resourceId} orgId updated to ${targetOrgId} within transaction`);

                const permissionCleanup = await cleanupResourcePermissions(
                    resourceId,
                    resource.orgId,
                    targetOrgId,
                    user.userId,
                    tx
                );

                const targetCleanup = await cleanupTargetSitesSafely(
                    resourceId,
                    targetOrgId,
                    tx
                );

                await tx.insert(userResources)
                    .values({
                        userId: user.userId,
                        resourceId
                    })
                    .onConflictDoNothing();

                logger.info(`User access granted for resource ${resourceId}`);

                return {
                    updatedResource,
                    permissionCleanup,
                    targetCleanup
                };

            } catch (txError: any) {
                logger.error(`Transaction error for resource ${resourceId}:`, {
                    error: txError.message,
                    stack: txError.stack,
                    resourceId,
                    originalOrgId: resource.orgId,
                    targetOrgId
                });

                // Re-throw to trigger transaction rollback
                throw txError;
            }
        });

        logger.info(`Resource ${resourceId} successfully moved`, {
            resourceId,
            resourceName: resource.name,
            oldOrgId: resource.orgId,
            newOrgId: targetOrgId,
            movedByUserId: user.userId,
            impactSummary: {
                permissionsRemoved: moveResult.permissionCleanup.deletedRolePermissions + moveResult.permissionCleanup.deletedUserPermissions,
                targetsDisconnected: moveResult.targetCleanup.targetsDisconnected
            }
        });

        const moveVerified = await verifyResourceState(resourceId, targetOrgId, "Post-move verification");

        if (!moveVerified) {
            logger.error(`Move verification failed for resource ${resourceId} - this should not happen`);
            throw new Error("Move verification failed");
        }

        return response(res, {
            data: {
                resourceId: moveResult.updatedResource.resourceId,
                resourceName: moveResult.updatedResource.name,
                oldOrgId: resource.orgId,
                newOrgId: targetOrgId,
                targetOrgName: targetOrg.name,
                moveImpact: {
                    rolePermissionsRemoved: moveResult.permissionCleanup.deletedRolePermissions,
                    userPermissionsRemoved: moveResult.permissionCleanup.deletedUserPermissions,
                    targetsDisconnected: moveResult.targetCleanup.targetsDisconnected,
                    disconnectedTargets: moveResult.targetCleanup.disconnectedTargets,
                    authenticationPreserved: true
                }
            },
            success: true,
            error: false,
            message: "Resource successfully moved to new organization",
            status: HttpCode.OK,
        });

    } catch (err: any) {
        // Transaction failed -- verify rollback worked and attempt recovery if needed
        logger.error(`Move operation failed for resource ${resourceId}:`, {
            error: err.message,
            stack: err.stack,
            originalOrgId: originalResource?.orgId,
            targetOrgId
        });


        if (resourceId && originalResource) {
            const rollbackVerified = await verifyResourceState(
                resourceId,
                originalResource.orgId,
                "Rollback verification"
            );

            if (!rollbackVerified) {
                try {
                    await emergencyRecovery(resourceId, originalResource.orgId);

                    const recoveryVerified = await verifyResourceState(
                        resourceId,
                        originalResource.orgId,
                        "Emergency recovery verification"
                    );

                    if (recoveryVerified) {
                        logger.info(`✓ Emergency recovery successful for resource ${resourceId}`);
                    } else {
                        logger.error(`✗ Emergency recovery failed for resource ${resourceId} - manual intervention required`);
                    }
                } catch (recoveryError) {
                    logger.error(`Emergency recovery failed for resource ${resourceId}:`, recoveryError);
                }
            }
        }

        // Return appropriate error message based on error type
        if (err.message && err.message.includes('NOT NULL constraint failed: targets.siteId')) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Cannot move resource: some targets have required site connections that cannot be transferred between organizations. The resource remains in its original organization."
                )
            );
        }

        if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Cannot move resource due to dependencies that cannot be transferred. The resource remains in its original organization."
                )
            );
        }

        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    "Cannot move resource due to conflicting data in the target organization. The resource remains in its original organization."
                )
            );
        }

        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to move resource. The resource remains in its original organization."
            )
        );
    }
}