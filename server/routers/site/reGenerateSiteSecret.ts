import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, newts, sites } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { hashPassword } from "@server/auth/password";
import { addPeer } from "../gerbil/peers";


const updateSiteParamsSchema = z
    .object({
        siteId: z.string().transform(Number).pipe(z.number().int().positive())
    })
    .strict();

const updateSiteBodySchema = z
    .object({
        type: z.enum(["newt", "wireguard"]),
        newtId: z.string().min(1).max(255).optional(),
        newtSecret: z.string().min(1).max(255).optional(),
        exitNodeId: z.number().int().positive().optional(),
        pubKey: z.string().optional(),
        subnet: z.string().optional(),
    })
    .strict();

registry.registerPath({
    method: "post",
    path: "/site/{siteId}/regenerate-secret",
    description: "Regenerate a site's Newt or WireGuard credentials by its site ID.",
    tags: [OpenAPITags.Site],
    request: {
        params: updateSiteParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateSiteBodySchema,
                },
            },
        },
    },
    responses: {},
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
                createHttpError(HttpCode.BAD_REQUEST, fromError(parsedParams.error).toString())
            );
        }

        const parsedBody = updateSiteBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, fromError(parsedBody.error).toString())
            );
        }

        const { siteId } = parsedParams.data;
        const { type, exitNodeId, pubKey, subnet, newtId, newtSecret } = parsedBody.data;

        let updatedSite = undefined;

        if (type === "newt") {
            if (!newtSecret) {
                return next(
                    createHttpError(HttpCode.BAD_REQUEST, "newtSecret is required for newt sites")
                );
            }

            const secretHash = await hashPassword(newtSecret);

            updatedSite = await db
                .update(newts)
                .set({
                    newtId,
                    secretHash,
                })
                .where(eq(newts.siteId, siteId))
                .returning();

            logger.info(`Regenerated Newt credentials for site ${siteId}`);

        } else if (type === "wireguard") {
            if (!pubKey) {
                return next(
                    createHttpError(HttpCode.BAD_REQUEST, "Public key is required for wireguard sites")
                );
            }

            if (!exitNodeId) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Exit node ID is required for wireguard sites"
                    )
                );
            }

            try {
                updatedSite = await db.transaction(async (tx) => {
                    await addPeer(exitNodeId, {
                        publicKey: pubKey,
                        allowedIps: subnet ? [subnet] : [],
                    });
                    const result = await tx
                        .update(sites)
                        .set({ pubKey })
                        .where(eq(sites.siteId, siteId))
                        .returning();

                    return result;
                });

                logger.info(`Regenerated WireGuard credentials for site ${siteId}`);
            } catch (err) {
                logger.error(
                    `Transaction failed while regenerating WireGuard secret for site ${siteId}`,
                    err
                );
                return next(
                    createHttpError(
                        HttpCode.INTERNAL_SERVER_ERROR,
                        "Failed to regenerate WireGuard credentials. Rolled back transaction."
                    )
                );
            }
        }

        return response(res, {
            data: updatedSite,
            success: true,
            error: false,
            message: "Credentials regenerated successfully",
            status: HttpCode.OK,
        });

    } catch (error) {
        logger.error("Unexpected error in reGenerateSiteSecret", error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An unexpected error occurred")
        );
    }
}
