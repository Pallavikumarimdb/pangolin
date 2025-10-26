import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, newts } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { hashPassword } from "@server/auth/password";

const updateSiteParamsSchema = z
    .object({
        siteId: z.string().transform(Number).pipe(z.number().int().positive())
    })
    .strict();

const updateSiteBodySchema = z
    .object({
        newtId: z.string().min(1).max(255).optional(),
        newtSecret: z.string().min(1).max(255).optional(),
    })
    .strict();

registry.registerPath({
    method: "post",
    path: "/site/{siteId}/regenerate-secret",
    description:
        "Regenerate a site's Newt credentials by its site ID.",
    tags: [OpenAPITags.Site],
    request: {
        params: updateSiteParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateSiteBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function reGenerateSiteSecret(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = updateSiteParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = updateSiteBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { siteId } = parsedParams.data;
        const { newtId, newtSecret } = parsedBody.data;

        const secretHash = await hashPassword(newtSecret!);
        const updatedSite = await db
            .update(newts)
            .set({
                newtId,
                secretHash
            })
            .where(eq(newts.siteId, siteId))
            .returning();

        if (updatedSite.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Site with ID ${siteId} not found`
                )
            );
        }

        return response(res, {
            data: updatedSite[0],
            success: true,
            error: false,
            message: "Credentials regenerated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
