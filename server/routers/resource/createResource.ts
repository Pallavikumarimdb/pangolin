import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import {
    domains,
    orgDomains,
    orgs,
    Resource,
    resources,
    resourceHostnames,
    roleResources,
    roles,
    userResources
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { eq, and } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { subdomainSchema } from "@server/lib/schemas";
import config from "@server/lib/config";
import { OpenAPITags, registry } from "@server/openApi";
import { build } from "@server/build";

const createResourceParamsSchema = z
    .object({
        orgId: z.string()
    })
    .strict();


const hostnameSchema = z.object({
    domainId: z.string().nonempty(),
    subdomain: z.string().optional(),
    baseDomain: z.string().optional(),
    fullDomain: z.string().optional(),
    primary: z.boolean().default(false),
});

const createHttpResourceSchema = z
    .object({
        name: z.string().min(1).max(255),
        subdomain: z.string().nullable().optional(),
        http: z.boolean(),
        protocol: z.enum(["tcp", "udp"]),
        domainId: z.string().optional(), 
        hostMode: z.enum(["multi", "redirect"]).default("multi"),
        hostnames: z.array(hostnameSchema).optional(),
    })
    .strict()
    .refine(
        (data) => {
            if (data.subdomain) {
                return subdomainSchema.safeParse(data.subdomain).success;
            }
            return true;
        },
        { message: "Invalid subdomain" }
    )
    .refine(
        (data) => {
            // Ensure at least one hostname is provided
            return data.domainId || (data.hostnames && data.hostnames.length > 0);
        },
        { message: "At least one domain must be specified" }
    )
    .refine(
        (data) => {
            // If using new hostnames format, ensure exactly one primary
            if (data.hostnames && data.hostnames.length > 0) {
                const primaryCount = data.hostnames.filter(h => h.primary).length;
                return primaryCount === 1;
            }
            return true;
        },
        { message: "Exactly one hostname must be marked as primary" }
    );

const createRawResourceSchema = z
    .object({
        name: z.string().min(1).max(255),
        http: z.boolean(),
        protocol: z.enum(["tcp", "udp"]),
        proxyPort: z.number().int().min(1).max(65535),
        // enableProxy: z.boolean().default(true) // always true now
    })
    .strict()
    .refine(
        (data) => {
            if (!config.getRawConfig().flags?.allow_raw_resources) {
                if (data.proxyPort !== undefined) {
                    return false;
                }
            }
            return true;
        },
        {
            message: "Raw resources are not allowed"
        }
    );

export type CreateResourceResponse = Resource & {
    hostnames?: Array<{
        hostnameId: number;
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
        primary: boolean;
    }>;
};

type ValidatedHostname = {
    domainId: string;
    subdomain?: string;
    fullDomain: string;
    baseDomain: string;
    primary: boolean;
};

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/resource",
    description: "Create a resource.",
    tags: [OpenAPITags.Org, OpenAPITags.Resource],
    request: {
        params: createResourceParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: createHttpResourceSchema.or(createRawResourceSchema)
                }
            }
        }
    },
    responses: {}
});

export async function createResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        // Validate request params
        const parsedParams = createResourceParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;

        if (req.user && !req.userOrgRoleId) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, "User does not have a role")
            );
        }

        // get the org
        const org = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (org.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Organization with ID ${orgId} not found`
                )
            );
        }

        if (typeof req.body.http !== "boolean") {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "http field is required")
            );
        }

        const { http } = req.body;

        if (http) {
            return await createHttpResource(
                { req, res, next },
                { orgId }
            );
        } else {
            if (
                !config.getRawConfig().flags?.allow_raw_resources &&
                build == "oss"
            ) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Raw resources are not allowed"
                    )
                );
            }
            return await createRawResource(
                { req, res, next },
                { orgId }
            );
        }
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}

async function createHttpResource(
    route: {
        req: Request;
        res: Response;
        next: NextFunction;
    },
    meta: {
        orgId: string;
    }
) {
    const { req, res, next } = route;
    const { orgId } = meta;

    const parsedBody = createHttpResourceSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const { name, hostMode, hostnames } = parsedBody.data;

    // handle backward compatibility ---> convert legacy format to new format
    let processedHostnames = hostnames;
    if (!hostnames && parsedBody.data.domainId) {
        processedHostnames = [{
            domainId: parsedBody.data.domainId,
            subdomain: parsedBody.data.subdomain || undefined,
            primary: true
        }];
    }

    if (!processedHostnames || processedHostnames.length === 0) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                "At least one hostname must be specified"
            )
        );
    }

    const validatedHostnames: ValidatedHostname[] = [];
    for (const hostname of processedHostnames) {
        const processResult = await processHostname(hostname, orgId);
        if (!processResult.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    processResult.error || "Failed to process hostname"
                )
            );
        }

        // Check for conflicts
        const existingResource = await db
            .select()
            .from(resources)
            .where(eq(resources.fullDomain, processResult.data!.fullDomain));

        if (existingResource.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    `Resource with domain ${processResult.data!.fullDomain} already exists`
                )
            );
        }

        const existingHostname = await db
            .select()
            .from(resourceHostnames)
            .where(eq(resourceHostnames.fullDomain, processResult.data!.fullDomain));

        if (existingHostname.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    `Resource with domain ${processResult.data!.fullDomain} already exists`
                )
            );
        }

        validatedHostnames.push(processResult.data!);
    }

    const primaryHostname = validatedHostnames.find(h => h.primary);
    if (!primaryHostname) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                "No primary hostname specified"
            )
        );
    }

    let resource: Resource | undefined;
    let createdHostnames: any[] = [];

    await db.transaction(async (trx) => {
        const newResource = await trx
            .insert(resources)
            .values({
                fullDomain: primaryHostname.fullDomain,
                domainId: primaryHostname.domainId,
                subdomain: primaryHostname.subdomain,
                orgId,
                name,
                http: true,
                protocol: "tcp",
                ssl: true,
                hostMode: hostMode || "multi"
            })
            .returning();

        const resourceId = newResource[0].resourceId;

        for (const hostname of validatedHostnames) {
            const insertedHostname = await trx.insert(resourceHostnames).values({
                resourceId,
                domainId: hostname.domainId,
                subdomain: hostname.subdomain,
                fullDomain: hostname.fullDomain,
                baseDomain: hostname.baseDomain,
                primary: hostname.primary,
            }).returning();

            createdHostnames.push({
                hostnameId: insertedHostname[0].hostnameId,
                domainId: hostname.domainId,
                subdomain: hostname.subdomain,
                fullDomain: hostname.fullDomain,
                baseDomain: hostname.baseDomain,
                primary: hostname.primary
            });
        }

        const adminRole = await db
            .select()
            .from(roles)
            .where(and(eq(roles.isAdmin, true), eq(roles.orgId, orgId)))
            .limit(1);

        if (adminRole.length === 0) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Admin role not found`)
            );
        }

        await trx.insert(roleResources).values({
            roleId: adminRole[0].roleId,
            resourceId: resourceId
        });

        if (req.user && req.userOrgRoleId != adminRole[0].roleId) {
            // make sure the user can access the resource
            await trx.insert(userResources).values({
                userId: req.user?.userId!,
                resourceId: resourceId
            });
        }

        resource = newResource[0];
    });

    if (!resource) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to create resource"
            )
        );
    }

    const responseData: CreateResourceResponse = {
        ...resource,
        hostnames: createdHostnames
    };

    return response<CreateResourceResponse>(res, {
        data: responseData,
        success: true,
        error: false,
        message: "Http resource created successfully",
        status: HttpCode.CREATED
    });
}

async function processHostname(
    hostname: {
        domainId: string;
        subdomain?: string;
        baseDomain?: string;
        fullDomain?: string;
        primary: boolean;
    },
    orgId: string
): Promise<{
    success: boolean;
    data?: ValidatedHostname;
    error?: string;
}> {
    try {
        const [domainRes] = await db
            .select()
            .from(domains)
            .where(eq(domains.domainId, hostname.domainId))
            .leftJoin(
                orgDomains,
                and(eq(orgDomains.orgId, orgId), eq(orgDomains.domainId, hostname.domainId))
            );

        if (!domainRes || !domainRes.domains) {
            return {
                success: false,
                error: `Domain with ID ${hostname.domainId} not found`
            };
        }

        if (domainRes.orgDomains && domainRes.orgDomains.orgId !== orgId) {
            return {
                success: false,
                error: `Organization does not have access to domain with ID ${hostname.domainId}`
            };
        }

        if (!domainRes.domains.verified) {
            return {
                success: false,
                error: `Domain with ID ${domainRes.domains.domainId} is not verified`
            };
        }

        let fullDomain = "";
        let subdomain = hostname.subdomain;

        if (domainRes.domains.type == "ns") {
            if (subdomain) {
                fullDomain = `${subdomain}.${domainRes.domains.baseDomain}`;
            } else {
                fullDomain = domainRes.domains.baseDomain;
            }
        } else if (domainRes.domains.type == "cname") {
            fullDomain = domainRes.domains.baseDomain;
        } else if (domainRes.domains.type == "wildcard") {
            if (subdomain) {
                const parsedSubdomain = subdomainSchema.safeParse(subdomain);
                if (!parsedSubdomain.success) {
                    return {
                        success: false,
                        error: fromError(parsedSubdomain.error).toString()
                    };
                }
                fullDomain = `${subdomain}.${domainRes.domains.baseDomain}`;
            } else {
                fullDomain = domainRes.domains.baseDomain;
            }
        }

        if (fullDomain === domainRes.domains.baseDomain) {
            subdomain = undefined;
        }

        fullDomain = fullDomain.toLowerCase();
        logger.debug(`Full domain: ${fullDomain}`);

        return {
            success: true,
            data: {
                domainId: hostname.domainId,
                subdomain: subdomain,
                fullDomain: fullDomain,
                baseDomain: domainRes.domains.baseDomain,
                primary: hostname.primary
            }
        };
    } catch (error) {
        logger.error('Error processing hostname:', error);
        return {
            success: false,
            error: 'Failed to process hostname'
        };
    }
}

async function createRawResource(
    route: {
        req: Request;
        res: Response;
        next: NextFunction;
    },
    meta: {
        orgId: string;
    }
) {
    const { req, res, next } = route;
    const { orgId } = meta;

    const parsedBody = createRawResourceSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const { name, http, protocol, proxyPort } = parsedBody.data;

    // if http is false check to see if there is already a resource with the same port and protocol
    const existingResource = await db
        .select()
        .from(resources)
        .where(
            and(
                eq(resources.protocol, protocol),
                eq(resources.proxyPort, proxyPort!)
            )
        );

    if (existingResource.length > 0) {
        return next(
            createHttpError(
                HttpCode.CONFLICT,
                "Resource with that protocol and port already exists"
            )
        );
    }

    let resource: Resource | undefined;

    await db.transaction(async (trx) => {
        const newResource = await trx
            .insert(resources)
            .values({
                orgId,
                name,
                http,
                protocol,
                proxyPort,
                // enableProxy
            })
            .returning();

        const adminRole = await db
            .select()
            .from(roles)
            .where(and(eq(roles.isAdmin, true), eq(roles.orgId, orgId)))
            .limit(1);

        if (adminRole.length === 0) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Admin role not found`)
            );
        }

        await trx.insert(roleResources).values({
            roleId: adminRole[0].roleId,
            resourceId: newResource[0].resourceId
        });

        if (req.user && req.userOrgRoleId != adminRole[0].roleId) {
            // make sure the user can access the resource
            await trx.insert(userResources).values({
                userId: req.user?.userId!,
                resourceId: newResource[0].resourceId
            });
        }

        resource = newResource[0];
    });

    if (!resource) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to create resource"
            )
        );
    }

    return response<CreateResourceResponse>(res, {
        data: resource,
        success: true,
        error: false,
        message: "Non-http resource created successfully",
        status: HttpCode.CREATED
    });
}
