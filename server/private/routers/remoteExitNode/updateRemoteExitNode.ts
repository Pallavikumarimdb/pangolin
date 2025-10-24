/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import { NextFunction, Request, Response } from "express";
import { db, exitNodes, exitNodeOrgs, ExitNode, ExitNodeOrg } from "@server/db";
import HttpCode from "@server/types/HttpCode";
import { z } from "zod";
import { remoteExitNodes } from "@server/db";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import { fromError } from "zod-validation-error";
import { hashPassword } from "@server/auth/password";
import logger from "@server/logger";
import { and, eq } from "drizzle-orm";
import { UpdateRemoteExitNodeResponse } from "@server/routers/remoteExitNode/types";
import { paramsSchema } from "./createRemoteExitNode";

const bodySchema = z
    .object({
        remoteExitNodeId: z.string().length(15),
        secret: z.string().length(48)
    })
    .strict();

export async function updateRemoteExitNode(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { remoteExitNodeId, secret } = parsedBody.data;

        if (req.user && !req.userOrgRoleId) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, "User does not have a role")
            );
        }

        const [existingRemoteExitNode] = await db
            .select()
            .from(remoteExitNodes)
            .where(eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId));

        if (!existingRemoteExitNode) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Remote Exit Node does not exist")
            );
        }

        const secretHash = await hashPassword(secret);

        await db
            .update(remoteExitNodes)
            .set({ secretHash })
            .where(eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId));

        return response<UpdateRemoteExitNodeResponse>(res, {
            data: {
                remoteExitNodeId,
                secret,
            },
            success: true,
            error: false,
            message: "Remote Exit Node secret updated successfully",
            status: HttpCode.OK,
        });
    } catch (e) {
        logger.error("Failed to update remoteExitNode", e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to update remoteExitNode"
            )
        );
    }
}
