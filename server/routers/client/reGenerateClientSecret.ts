import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, olms, } from "@server/db";
import { clients } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { eq, and } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { hashPassword } from "@server/auth/password";

const reGenerateSecretParamsSchema = z
    .object({
        clientId: z.string().transform(Number).pipe(z.number().int().positive())
    })
    .strict();

const reGenerateSecretBodySchema = z
    .object({
        olmId: z.string().min(1).optional(),
        secret: z.string().min(1).optional(),

    })
    .strict();

export type ReGenerateSecretBody = z.infer<typeof reGenerateSecretBodySchema>;

registry.registerPath({
    method: "post",
    path: "/client/{clientId}/regenerate-secret",
    description: "Regenerate a client's OLM credentials by its client ID.",
    tags: [OpenAPITags.Client],
    request: {
        params: reGenerateSecretParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: reGenerateSecretBodySchema
                }
            }
        }
    },
    responses: {}
});


export async function reGenerateClientSecret(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = reGenerateSecretBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { olmId, secret } = parsedBody.data;

        const parsedParams = reGenerateSecretParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { clientId } = parsedParams.data;

        let secretHash = undefined;
        if (secret) {
            secretHash = await hashPassword(secret);
        }


        // Fetch the client to make sure it exists and the user has access to it
        const [client] = await db
            .select()
            .from(clients)
            .where(eq(clients.clientId, clientId))
            .limit(1);

        if (!client) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Client with ID ${clientId} not found`
                )
            );
        }

        const [existingOlm] = await db
            .select()
            .from(olms)
            .where(eq(olms.clientId, clientId))
            .limit(1);

        if (existingOlm && olmId && secretHash) {
            await db
                .update(olms)
                .set({
                    olmId,
                    secretHash
                })
                .where(eq(olms.clientId, clientId));
        }

        return response(res, {
            data: existingOlm,
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
