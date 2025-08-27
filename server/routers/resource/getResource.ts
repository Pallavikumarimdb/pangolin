import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { Resource, resources, resourceHostnames } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";

const getResourceSchema = z
    .object({
        resourceId: z
            .string()
            .transform(Number)
            .pipe(z.number().int().positive())
    })
    .strict();

export type GetResourceResponse = Resource & {
    hostnames?: Array<{
        hostnameId: number;
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
        primary: boolean;
    }>;
};

registry.registerPath({
    method: "get",
    path: "/resource/{resourceId}",
    description: "Get a resource.",
    tags: [OpenAPITags.Resource],
    request: {
        params: getResourceSchema
    },
    responses: {}
});

export async function getResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getResourceSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        const [resp] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        const resource = resp;

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        // Get hostnames for HTTP resources
        let hostnames: GetResourceResponse["hostnames"] = [];
        if (resource.http) {
            const hostnameResults = await db
                .select()
                .from(resourceHostnames)
                .where(eq(resourceHostnames.resourceId, resourceId));

            hostnames = hostnameResults.map(h => ({
                hostnameId: h.hostnameId!,
                domainId: h.domainId,
                subdomain: h.subdomain || undefined,
                fullDomain: h.fullDomain!,
                baseDomain: h.baseDomain!,
                primary: h.primary
            }));
        }

        const responseData: GetResourceResponse = {
            ...resource,
            ...(resource.http && { hostnames })
        };

        return response(res, {
            data: responseData,
            success: true,
            error: false,
            message: "Resource retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
