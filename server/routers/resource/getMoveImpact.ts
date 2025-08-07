import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { 
    resources, 
    orgs, 
    userOrgs, 
    userResources, 
    roleResources,
    roles,
    users
} from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { registry, OpenAPITags } from "@server/openApi";

const getMoveImpactParamsSchema = z.object({
    resourceId: z.string().transform(Number).pipe(z.number().int().positive()),
});

const getMoveImpactQuerySchema = z.object({
    targetOrgId: z.string().min(1)
});

registry.registerPath({
    method: "get",
    path: "/resource/{resourceId}/move-impact",
    description: "Get the impact analysis of moving a resource to a different org",
    tags: [OpenAPITags.Resource],
    request: {
        params: getMoveImpactParamsSchema,
        query: getMoveImpactQuerySchema
    },
    responses: {
        200: {
            description: "Move impact analysis",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            data: {
                                type: "object",
                                properties: {
                                    resourceId: { type: "number" },
                                    resourceName: { type: "string" },
                                    currentOrgId: { type: "string" },
                                    currentOrgName: { type: "string" },
                                    targetOrgId: { type: "string" },
                                    targetOrgName: { type: "string" },
                                    impact: {
                                        type: "object",
                                        properties: {
                                            rolePermissions: {
                                                type: "object",
                                                properties: {
                                                    count: { type: "number" },
                                                    details: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            properties: {
                                                                roleId: { type: "number" },
                                                                roleName: { type: "string" }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            userPermissions: {
                                                type: "object",
                                                properties: {
                                                    count: { type: "number" },
                                                    details: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            properties: {
                                                                userId: { type: "string" },
                                                                username: { type: "string" },
                                                                email: { type: "string" }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            totalImpactedPermissions: { type: "number" },
                                            authenticationPreserved: { type: "boolean" },
                                            movingUserRetainsAccess: { type: "boolean" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
});

export async function getMoveImpact(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const parsedParams = getMoveImpactParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(createHttpError(HttpCode.BAD_REQUEST, fromError(parsedParams.error).toString()));
        }

        const parsedQuery = getMoveImpactQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(createHttpError(HttpCode.BAD_REQUEST, fromError(parsedQuery.error).toString()));
        }

        const { resourceId } = parsedParams.data;
        const { targetOrgId } = parsedQuery.data;
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

        // set req.userOrgId to source org for permission check
        req.userOrgId = resource.orgId;

        if (resource.orgId === targetOrgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, `Resource is already in this organization`)
            );
        }

        const [currentOrg] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, resource.orgId))
            .limit(1);

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

        // get role-based permissions that will be affected
        const rolePermissionsQuery = await db
            .select({
                roleId: roleResources.roleId,
                roleName: roles.name,
                roleDescription: roles.description
            })
            .from(roleResources)
            .innerJoin(roles, eq(roleResources.roleId, roles.roleId))
            .where(eq(roleResources.resourceId, resourceId));

        // get user permissions that will be affected (excluding moving user)
        const userPermissionsQuery = await db
            .select({
                userId: userResources.userId,
                username: users.username,
                email: users.email,
                name: users.name
            })
            .from(userResources)
            .innerJoin(users, eq(userResources.userId, users.userId))
            .where(and(
                eq(userResources.resourceId, resourceId),
                // exclude the moving user from the impact as they'll retain access
                // Note: We'll show this in the UI but they won't "lose" access
            ));

        // Separate moving user from others who will lose access
        const movingUserPermission = userPermissionsQuery.find(up => up.userId === user.userId);
        const otherUserPermissions = userPermissionsQuery.filter(up => up.userId !== user.userId);

        const totalImpactedPermissions = rolePermissionsQuery.length + otherUserPermissions.length;

        const impactData = {
            resourceId: resource.resourceId,
            resourceName: resource.name,
            currentOrgId: resource.orgId,
            currentOrgName: currentOrg?.name || 'Unknown',
            targetOrgId,
            targetOrgName: targetOrg.name,
            impact: {
                rolePermissions: {
                    count: rolePermissionsQuery.length,
                    details: rolePermissionsQuery.map(rp => ({
                        roleId: rp.roleId,
                        roleName: rp.roleName,
                        roleDescription: rp.roleDescription
                    }))
                },
                userPermissions: {
                    count: otherUserPermissions.length,
                    details: otherUserPermissions.map(up => ({
                        userId: up.userId,
                        username: up.username,
                        email: up.email || '',
                        name: up.name || ''
                    }))
                },
                movingUser: movingUserPermission ? {
                    userId: movingUserPermission.userId,
                    username: movingUserPermission.username,
                    email: movingUserPermission.email || '',
                    name: movingUserPermission.name || '',
                    retainsAccess: true
                } : null,
                totalImpactedPermissions,
                authenticationPreserved: true, // Passwords, pins, etc. are preserved
                movingUserRetainsAccess: true
            }
        };

        logger.info(`Move impact calculated for resource ${resourceId}`, {
            resourceId,
            currentOrgId: resource.orgId,
            targetOrgId,
            userId: user.userId,
            rolePermissionsAffected: rolePermissionsQuery.length,
            userPermissionsAffected: otherUserPermissions.length,
            totalImpact: totalImpactedPermissions
        });

        return response(res, {
            data: impactData,
            success: true,
            error: false,
            message: "Move impact analysis completed successfully",
            status: HttpCode.OK,
        });

    } catch (err) {
        logger.error("Error calculating move impact:", err);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred while calculating move impact")
        );
    }
}