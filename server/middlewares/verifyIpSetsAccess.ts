import { Request, Response, NextFunction } from "express";
import { db } from "@server/db";
import { ipSets, userOrgs } from "@server/db";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";

export async function verifyIPSetAccess(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const userId = req.user?.userId;
    const ipSetId = req.params.ipSetId;
    const orgId = req.params.orgId;

    if (!userId) {
        return next(createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated"));
    }

    if (!ipSetId) {
        return next(createHttpError(HttpCode.BAD_REQUEST, "IP set ID is required"));
    }

    if (!orgId) {
        return next(createHttpError(HttpCode.BAD_REQUEST, "Organization ID is required"));
    }

    try {
        // Check if the IP set exists and belongs to the organization
        const [ipSet] = await db
            .select()
            .from(ipSets)
            .where(
                and(
                    eq(ipSets.id, ipSetId),
                    eq(ipSets.orgId, orgId) // Assuming you added orgId to ipSets table
                )
            )
            .limit(1);

        if (!ipSet) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `IP set with ID ${ipSetId} not found in organization ${orgId}`
                )
            );
        }

        // The verifyOrgAccess middleware should have already verified the user's access to the org
        // So if we reach here, the user has access to the IP set
        return next();

    } catch (error) {
        console.error("Error verifying IP set access:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying IP set access"
            )
        );
    }
}