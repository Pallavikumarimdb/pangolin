import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { newts, resources, sites, Target, targets } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { addPeer } from "../gerbil/peers";
import { isIpInCidr } from "@server/lib/ip";
import { fromError } from "zod-validation-error";
import { addTargets } from "../newt/targets";
import { eq } from "drizzle-orm";
import { pickPort } from "./helpers";
import { isTargetValid } from "@server/lib/validators";
import { OpenAPITags, registry } from "@server/openApi";

const createTargetParamsSchema = z
    .object({
        resourceId: z
            .string()
            .transform(Number)
            .pipe(z.number().int().positive())
    })
    .strict();

const createTargetSchema = z
    .object({
        siteId: z.number().int().positive(),
        ip: z.string().refine(isTargetValid),
        method: z.string().optional().nullable(),
        port: z.number().int().min(1).max(65535),
        enabled: z.boolean().default(true),
        path: z.string().optional().nullable(),
        pathMatchType: z.enum(["exact", "prefix", "regex"]).optional().nullable(),
        priority: z.number().int().min(1).max(1000).default(100)
    })
    .strict();

export type CreateTargetResponse = Target;

registry.registerPath({
    method: "put",
    path: "/resource/{resourceId}/target",
    description: "Create a target for a resource.",
    tags: [OpenAPITags.Resource, OpenAPITags.Target],
    request: {
        params: createTargetParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: createTargetSchema
                }
            }
        }
    },
    responses: {}
});

export async function createTarget(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = createTargetSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const targetData = parsedBody.data;

        const parsedParams = createTargetParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        // get the resource
        const [resource] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId));

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        const siteId = targetData.siteId;

        const [site] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, siteId))
            .limit(1);

        if (!site) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Site with ID ${siteId} not found`
                )
            );
        }

        const existingTargets = await db
            .select()
            .from(targets)
            .where(eq(targets.resourceId, resourceId));

        const existingTarget = existingTargets.find(
            (target) =>
                target.ip === targetData.ip &&
                target.port === targetData.port &&
                target.method === targetData.method &&
                target.siteId === targetData.siteId
        );

        if (existingTarget) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    `Target with IP ${targetData.ip}, port ${targetData.port}, method ${targetData.method} already exists for resource ID ${resourceId}`
                )
            );
        }

        let newTarget: Target[] = [];
        if (site.type == "local") {
            newTarget = await db
                .insert(targets)
                .values({
                    resourceId,
                    ...targetData
                })
                .returning();
        } else {
            // make sure the target is within the site subnet
            if (
                site.type == "wireguard" &&
                !isIpInCidr(targetData.ip, site.subnet!)
            ) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        `Target IP is not within the site subnet`
                    )
                );
            }

            const { internalPort, targetIps } = await pickPort(site.siteId!, db);

            if (!internalPort) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        `No available internal port`
                    )
                );
            }

            newTarget = await db
                .insert(targets)
                .values({
                    resourceId,
                    internalPort,
                    ...targetData
                })
                .returning();

            // add the new target to the targetIps array
            targetIps.push(`${targetData.ip}/32`);

            if (site.pubKey) {
                if (site.type == "wireguard") {
                    await addPeer(site.exitNodeId!, {
                        publicKey: site.pubKey,
                        allowedIps: targetIps.flat()
                    });
                } else if (site.type == "newt") {
                    // get the newt on the site by querying the newt table for siteId
                    const [newt] = await db
                        .select()
                        .from(newts)
                        .where(eq(newts.siteId, site.siteId))
                        .limit(1);

                    await addTargets(
                        newt.newtId,
                        newTarget,
                        resource.protocol,
                        resource.proxyPort
                    );
                }
            }
        }

        return response<CreateTargetResponse>(res, {
            data: newTarget[0],
            success: true,
            error: false,
            message: "Target created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
