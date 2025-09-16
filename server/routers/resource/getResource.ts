import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { Resource, resources, resourceHostnames } from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import stoi from "@server/lib/stoi";
import { OpenAPITags, registry } from "@server/openApi";

const getResourceHostnamesParamsSchema = z
    .object({
        resourceId: z
            .string()
            .optional()
            .transform(stoi)
            .pipe(z.number().int().positive().optional())
            .optional(),
        niceId: z.string().optional(),
        orgId: z.string().optional()
    })
    .strict();


async function query(resourceId?: number, niceId?: string, orgId?: string) {
    if (resourceId) {
        const [res] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);
        return res;
    } else if (niceId && orgId) {
        const [res] = await db
            .select()
            .from(resources)
            .where(and(eq(resources.niceId, niceId), eq(resources.orgId, orgId)))
            .limit(1);
        return res;
    }
}

export type GetResourceResponseWithHostnames = {
    data: Resource;
    hostMode: string;
    hostnames: Array<{
        hostnameId: number;
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
        primary: boolean;
        createdAt: string;
    }>;
};

export type GetResourceResponse = Resource;


registry.registerPath({
    method: "get",
    path: "/org/{orgId}/resource/{niceId}",
    description:
        "Get a resource by orgId and niceId. NiceId is a readable ID for the resource and unique on a per org basis.",
    tags: [OpenAPITags.Org, OpenAPITags.Resource],
    request: {
        params: z.object({
            orgId: z.string(),
            niceId: z.string()
        })
    },
    responses: {}
});

registry.registerPath({
    method: "get",
    path: "/resource/{resourceId}",
    description: "Get a resource by resourceId.",
    tags: [OpenAPITags.Resource],
    request: {
        params: z.object({
            resourceId: z.number()
        })
    },
    responses: {}
});
export async function getResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getResourceHostnamesParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId, niceId, orgId } = parsedParams.data;

        // Use new query helper
        const resource = await query(resourceId, niceId, orgId);

        if (!resource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Resource with ID ${resourceId} not found`)
            );
        }

        // Only HTTP resources have hostnames
        if (!resource.http) {
            return response<GetResourceResponse>(res, {
                data: resource,
                success: true,
                error: false,
                message: "Resource retrieved successfully",
                status: HttpCode.OK
            });
        }


        // Get hostnames for the resource
        const hostnames = await db
            .select({
                hostnameId: resourceHostnames.hostnameId,
                domainId: resourceHostnames.domainId,
                subdomain: resourceHostnames.subdomain,
                fullDomain: resourceHostnames.fullDomain,
                baseDomain: resourceHostnames.baseDomain,
                primary: resourceHostnames.primary,
                createdAt: resourceHostnames.createdAt
            })
            .from(resourceHostnames)
            .where(eq(resourceHostnames.resourceId, resource.resourceId))
            .orderBy(resourceHostnames.primary, resourceHostnames.createdAt);

        return response<GetResourceResponseWithHostnames>(res, {
            data: {
                data: resource,
                hostMode: resource.hostMode || "multi",
                hostnames: hostnames.map(h => ({
                    hostnameId: h.hostnameId,
                    domainId: h.domainId,
                    subdomain: h.subdomain || undefined,
                    fullDomain: h.fullDomain,
                    baseDomain: h.baseDomain,
                    primary: h.primary,
                    createdAt: h.createdAt
                }))
            },
            success: true,
            error: false,
            message: "Resource hostnames retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}