import { db, targetHealthCheck, domains } from "@server/db";
import {
    and,
    eq,
    inArray,
    or,
    isNull,
    ne,
    isNotNull,
    desc,
    sql
} from "drizzle-orm";
import logger from "@server/logger";
import config from "@server/lib/config";
import { resources, sites, Target, targets } from "@server/db";
import createPathRewriteMiddleware from "./middleware";
import { sanitize, validatePathRewriteConfig } from "./utils";

const redirectHttpsMiddlewareName = "redirect-to-https";
const badgerMiddlewareName = "badger";


function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
}


export function generateMaintenanceHTML(
    title: string | null,
    message: string | null,
    estimatedTime: string | null
): string {
    const safeTitle = escapeHtml(title || 'Service Temporarily Unavailable');
    const safeMessage = escapeHtml(message || 'We are currently experiencing technical difficulties. Please check back soon.');
    const safeEstimatedTime = estimatedTime ? escapeHtml(estimatedTime) : null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>${safeTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            padding: 1rem;
            line-height: 1.6;
        }
        .container {
            text-align: center;
            padding: 3rem 2rem;
            max-width: 600px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1.5rem;
            animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            font-weight: 700;
            line-height: 1.2;
        }
        .message {
            font-size: 1.2rem;
            margin-bottom: 1rem;
            opacity: 0.95;
        }
        .time {
            margin-top: 1.5rem;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 500;
        }
        @media (max-width: 640px) {
            h1 { font-size: 2rem; }
            .message { font-size: 1rem; }
            .container { padding: 2rem 1.5rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔧</div>
        <h1>${safeTitle}</h1>
        <p class="message">${safeMessage}</p>
        ${safeEstimatedTime ?
            `<div class="time">
                <strong>Estimated completion:</strong><br>
                ${safeEstimatedTime}
            </div>`
            : ''}
    </div>
</body>
</html>`;
}

export async function getTraefikConfig(
    exitNodeId: number,
    siteTypes: string[],
    filterOutNamespaceDomains = false,
    generateLoginPageRouters = false,
    allowRawResources = true
): Promise<any> {
    // Define extended target type with site information
    type TargetWithSite = Target & {
        site: {
            siteId: number;
            type: string;
            subnet: string | null;
            exitNodeId: number | null;
            online: boolean;
        };
    };

    // Get resources with their targets and sites in a single optimized query
    // Start from sites on this exit node, then join to targets and resources
    const resourcesWithTargetsAndSites = await db
        .select({
            // Resource fields
            resourceId: resources.resourceId,
            resourceName: resources.name,
            fullDomain: resources.fullDomain,
            ssl: resources.ssl,
            http: resources.http,
            proxyPort: resources.proxyPort,
            protocol: resources.protocol,
            subdomain: resources.subdomain,
            domainId: resources.domainId,
            enabled: resources.enabled,
            stickySession: resources.stickySession,
            tlsServerName: resources.tlsServerName,
            setHostHeader: resources.setHostHeader,
            enableProxy: resources.enableProxy,
            headers: resources.headers,
            proxyProtocol: resources.proxyProtocol,
            proxyProtocolVersion: resources.proxyProtocolVersion,

            maintenanceModeEnabled: resources.maintenanceModeEnabled,
            maintenanceModeType: resources.maintenanceModeType,
            maintenanceTitle: resources.maintenanceTitle,
            maintenanceMessage: resources.maintenanceMessage,
            maintenanceEstimatedTime: resources.maintenanceEstimatedTime,
            // Target fields
            targetId: targets.targetId,
            targetEnabled: targets.enabled,
            ip: targets.ip,
            method: targets.method,
            port: targets.port,
            internalPort: targets.internalPort,
            hcHealth: targetHealthCheck.hcHealth,
            path: targets.path,
            pathMatchType: targets.pathMatchType,
            rewritePath: targets.rewritePath,
            rewritePathType: targets.rewritePathType,
            priority: targets.priority,

            // Site fields
            siteId: sites.siteId,
            siteType: sites.type,
            siteOnline: sites.online,
            subnet: sites.subnet,
            exitNodeId: sites.exitNodeId,
            // Domain cert resolver fields
            domainCertResolver: domains.certResolver
        })
        .from(sites)
        .innerJoin(targets, eq(targets.siteId, sites.siteId))
        .innerJoin(resources, eq(resources.resourceId, targets.resourceId))
        .leftJoin(domains, eq(domains.domainId, resources.domainId))
        .leftJoin(
            targetHealthCheck,
            eq(targetHealthCheck.targetId, targets.targetId)
        )
        .where(
            and(
                eq(targets.enabled, true),
                eq(resources.enabled, true),
                or(
                    eq(sites.exitNodeId, exitNodeId),
                    and(
                        isNull(sites.exitNodeId),
                        sql`(${siteTypes.includes("local") ? 1 : 0} = 1)`, // only allow local sites if "local" is in siteTypes
                        eq(sites.type, "local")
                    )
                ),
                or(
                    ne(targetHealthCheck.hcHealth, "unhealthy"), // Exclude unhealthy targets
                    isNull(targetHealthCheck.hcHealth) // Include targets with no health check record
                ),
                inArray(sites.type, siteTypes),
                allowRawResources
                    ? isNotNull(resources.http) // ignore the http check if allow_raw_resources is true
                    : eq(resources.http, true)
            )
        )
        .orderBy(desc(targets.priority), targets.targetId); // stable ordering

    // Group by resource and include targets with their unique site data
    const resourcesMap = new Map();

    resourcesWithTargetsAndSites.forEach((row) => {
        const resourceId = row.resourceId;
        const resourceName = sanitize(row.resourceName) || "";
        const targetPath = sanitize(row.path) || ""; // Handle null/undefined paths
        const pathMatchType = row.pathMatchType || "";
        const rewritePath = row.rewritePath || "";
        const rewritePathType = row.rewritePathType || "";
        const priority = row.priority ?? 100;

        // Create a unique key combining resourceId, path config, and rewrite config
        const pathKey = [
            targetPath,
            pathMatchType,
            rewritePath,
            rewritePathType
        ]
            .filter(Boolean)
            .join("-");
        const mapKey = [resourceId, pathKey].filter(Boolean).join("-");
        const key = sanitize(mapKey);

        if (!resourcesMap.has(key)) {
            const validation = validatePathRewriteConfig(
                row.path,
                row.pathMatchType,
                row.rewritePath,
                row.rewritePathType
            );

            if (!validation.isValid) {
                logger.error(
                    `Invalid path rewrite configuration for resource ${resourceId}: ${validation.error}`
                );
                return;
            }

            resourcesMap.set(key, {
                resourceId: row.resourceId,
                name: resourceName,
                fullDomain: row.fullDomain,
                ssl: row.ssl,
                http: row.http,
                proxyPort: row.proxyPort,
                protocol: row.protocol,
                subdomain: row.subdomain,
                domainId: row.domainId,
                enabled: row.enabled,
                stickySession: row.stickySession,
                tlsServerName: row.tlsServerName,
                setHostHeader: row.setHostHeader,
                enableProxy: row.enableProxy,
                targets: [],
                headers: row.headers,
                proxyProtocol: row.proxyProtocol,
                proxyProtocolVersion: row.proxyProtocolVersion ?? 1,
                path: row.path, // the targets will all have the same path
                pathMatchType: row.pathMatchType, // the targets will all have the same pathMatchType
                rewritePath: row.rewritePath,
                rewritePathType: row.rewritePathType,
                priority: priority,
                // Store domain cert resolver fields
                domainCertResolver: row.domainCertResolver,
                maintenanceModeEnabled: row.maintenanceModeEnabled,
                maintenanceModeType: row.maintenanceModeType,
                maintenanceTitle: row.maintenanceTitle,
                maintenanceMessage: row.maintenanceMessage,
                maintenanceEstimatedTime: row.maintenanceEstimatedTime,
            });
        }

        resourcesMap.get(key).targets.push({
            resourceId: row.resourceId,
            targetId: row.targetId,
            ip: row.ip,
            method: row.method,
            port: row.port,
            internalPort: row.internalPort,
            enabled: row.targetEnabled,
            site: {
                siteId: row.siteId,
                type: row.siteType,
                subnet: row.subnet,
                exitNodeId: row.exitNodeId,
                online: row.siteOnline
            }
        });
    });

    // make sure we have at least one resource
    if (resourcesMap.size === 0) {
        return {};
    }

    const config_output: any = {
        http: {
            middlewares: {
                [redirectHttpsMiddlewareName]: {
                    redirectScheme: {
                        scheme: "https"
                    }
                }
            }
        }
    };

    // get the key and the resource
    for (const [key, resource] of resourcesMap.entries()) {
        const targets = resource.targets;

        const routerName = `${key}-${resource.name}-router`;
        const serviceName = `${key}-${resource.name}-service`;
        const fullDomain = `${resource.fullDomain}`;
        const transportName = `${key}-transport`;
        const headersMiddlewareName = `${key}-headers-middleware`;

        if (!resource.enabled) {
            continue;
        }

        if (resource.http) {
            if (!resource.domainId || !resource.fullDomain) {
                continue;
            }

            // Initialize routers and services if they don't exist
            if (!config_output.http.routers) {
                config_output.http.routers = {};
            }
            if (!config_output.http.services) {
                config_output.http.services = {};
            }

            // available healthy servers for automatic mode
            const availableServers = (targets as TargetWithSite[]).filter(
                (target: TargetWithSite) => {
                    if (!target.enabled) return false;

                    const anySitesOnline = (targets as TargetWithSite[]).some(
                        (t: TargetWithSite) => t.site.online
                    );
                    if (anySitesOnline && !target.site.online) return false;

                    if (target.site.type === "local" || target.site.type === "wireguard") {
                        return target.ip && target.port && target.method;
                    } else if (target.site.type === "newt") {
                        return target.internalPort && target.method && target.site.subnet;
                    }
                    return false;
                }
            );

            const hasHealthyServers = availableServers.length > 0;

            let showMaintenancePage = false;
            if (resource.maintenanceModeEnabled) {
                if (resource.maintenanceModeType === "forced") {
                    showMaintenancePage = true;
                    logger.info(
                        `Resource ${resource.name} (${fullDomain}) is in FORCED maintenance mode`
                    );
                } else if (resource.maintenanceModeType === "automatic") {
                    showMaintenancePage = !hasHealthyServers;
                    if (showMaintenancePage) {
                        logger.warn(
                            `Resource ${resource.name} (${fullDomain}) has no healthy servers - showing maintenance page (AUTOMATIC mode)`
                        );
                    }
                }
            }

            if (showMaintenancePage) {
                const maintenanceServiceName = `${key}-maintenance-service`;
                const routerName = `${key}-maintenance-router`;

                const maintenancePort = config.getRawConfig().traefik.maintenance_port || 8888;
                const entrypointHttp = config.getRawConfig().traefik.http_entrypoint;
                const entrypointHttps = config.getRawConfig().traefik.https_entrypoint;

                const fullDomain = resource.fullDomain;
                const domainParts = fullDomain.split(".");
                const wildCard = resource.subdomain
                    ? `*.${domainParts.slice(1).join(".")}`
                    : fullDomain;

                const tls = {
                    certResolver: resource.domainCertResolver?.trim() ||
                        config.getRawConfig().traefik.cert_resolver,
                    ...(resource.preferWildcardCert ?? config.getRawConfig().traefik.prefer_wildcard_cert
                        ? { domains: [{ main: wildCard }] }
                        : {})
                };

                const maintenanceHost = config.getRawConfig().traefik?.maintenance_host || 'pangolin';

                config_output.http.services[maintenanceServiceName] = {
                    loadBalancer: {
                        servers: [{ url: `http://${maintenanceHost}:${maintenancePort}` }],
                        passHostHeader: true
                    }
                };

                const rule = `Host(\`${fullDomain}\`)`;

                config_output.http.routers[routerName] = {
                    entryPoints: [resource.ssl ? entrypointHttps : entrypointHttp],
                    service: maintenanceServiceName,
                    rule,
                    priority: 2000,
                    ...(resource.ssl ? { tls } : {})
                };

                if (resource.ssl) {
                    config_output.http.routers[`${routerName}-redirect`] = {
                        entryPoints: [entrypointHttp],
                        middlewares: [redirectHttpsMiddlewareName],
                        service: maintenanceServiceName,
                        rule,
                        priority: 2000
                    };
                }

                continue;
            }

            const domainParts = fullDomain.split(".");
            let wildCard;
            if (domainParts.length <= 2) {
                wildCard = `*.${domainParts.join(".")}`;
            } else {
                wildCard = `*.${domainParts.slice(1).join(".")}`;
            }

            if (!resource.subdomain) {
                wildCard = resource.fullDomain;
            }

            const globalDefaultResolver =
                config.getRawConfig().traefik.cert_resolver;
            const globalDefaultPreferWildcard =
                config.getRawConfig().traefik.prefer_wildcard_cert;

            const domainCertResolver = resource.domainCertResolver;
            const preferWildcardCert = resource.preferWildcardCert;

            let resolverName: string | undefined;
            let preferWildcard: boolean | undefined;
            // Handle both letsencrypt & custom cases
            if (domainCertResolver) {
                resolverName = domainCertResolver.trim();
            } else {
                resolverName = globalDefaultResolver;
            }

            if (
                preferWildcardCert !== undefined &&
                preferWildcardCert !== null
            ) {
                preferWildcard = preferWildcardCert;
            } else {
                preferWildcard = globalDefaultPreferWildcard;
            }

            const tls = {
                certResolver: resolverName,
                ...(preferWildcard
                    ? {
                        domains: [
                            {
                                main: wildCard
                            }
                        ]
                    }
                    : {})
            };

            const additionalMiddlewares =
                config.getRawConfig().traefik.additional_middlewares || [];

            const routerMiddlewares = [
                badgerMiddlewareName,
                ...additionalMiddlewares
            ];

            // Handle path rewriting middleware
            if (
                resource.rewritePath !== null &&
                resource.path !== null &&
                resource.pathMatchType &&
                resource.rewritePathType
            ) {
                // Create a unique middleware name
                const rewriteMiddlewareName = `rewrite-r${resource.resourceId}-${key}`;

                try {
                    const rewriteResult = createPathRewriteMiddleware(
                        rewriteMiddlewareName,
                        resource.path,
                        resource.pathMatchType,
                        resource.rewritePath,
                        resource.rewritePathType
                    );

                    // Initialize middlewares object if it doesn't exist
                    if (!config_output.http.middlewares) {
                        config_output.http.middlewares = {};
                    }

                    // the middleware to the config
                    Object.assign(
                        config_output.http.middlewares,
                        rewriteResult.middlewares
                    );

                    // middlewares to the router middleware chain
                    if (rewriteResult.chain) {
                        // For chained middlewares (like stripPrefix + addPrefix)
                        routerMiddlewares.push(...rewriteResult.chain);
                    } else {
                        // Single middleware
                        routerMiddlewares.push(rewriteMiddlewareName);
                    }

                    logger.debug(
                        `Created path rewrite middleware ${rewriteMiddlewareName}: ${resource.pathMatchType}(${resource.path}) -> ${resource.rewritePathType}(${resource.rewritePath})`
                    );
                } catch (error) {
                    logger.error(
                        `Failed to create path rewrite middleware for resource ${resource.resourceId}: ${error}`
                    );
                }
            }

            // Handle custom headers middleware
            if (resource.headers || resource.setHostHeader) {
                const headersObj: { [key: string]: string } = {};

                if (resource.headers) {
                    let headersArr: { name: string; value: string }[] = [];
                    try {
                        headersArr = JSON.parse(resource.headers) as {
                            name: string;
                            value: string;
                        }[];
                    } catch (e) {
                        logger.warn(
                            `Failed to parse headers for resource ${resource.resourceId}: ${e}`
                        );
                    }

                    headersArr.forEach((header) => {
                        headersObj[header.name] = header.value;
                    });
                }

                if (resource.setHostHeader) {
                    headersObj["Host"] = resource.setHostHeader;
                }

                if (Object.keys(headersObj).length > 0) {
                    if (!config_output.http.middlewares) {
                        config_output.http.middlewares = {};
                    }
                    config_output.http.middlewares[headersMiddlewareName] = {
                        headers: {
                            customRequestHeaders: headersObj
                        }
                    };

                    routerMiddlewares.push(headersMiddlewareName);
                }
            }

            // Build routing rules
            let rule = `Host(\`${fullDomain}\`)`;

            // priority logic
            let priority: number;
            if (resource.priority && resource.priority != 100) {
                priority = resource.priority;
            } else {
                priority = 100;
                if (resource.path && resource.pathMatchType) {
                    priority += 10;
                    if (resource.pathMatchType === "exact") {
                        priority += 5;
                    } else if (resource.pathMatchType === "prefix") {
                        priority += 3;
                    } else if (resource.pathMatchType === "regex") {
                        priority += 2;
                    }
                    if (resource.path === "/") {
                        priority = 1; // lowest for catch-all
                    }
                }
            }

            if (resource.path && resource.pathMatchType) {
                // priority += 1;
                // add path to rule based on match type
                let path = resource.path;
                // if the path doesn't start with a /, add it
                if (!path.startsWith("/")) {
                    path = `/${path}`;
                }
                if (resource.pathMatchType === "exact") {
                    rule += ` && Path(\`${path}\`)`;
                } else if (resource.pathMatchType === "prefix") {
                    rule += ` && PathPrefix(\`${path}\`)`;
                } else if (resource.pathMatchType === "regex") {
                    rule += ` && PathRegexp(\`${resource.path}\`)`; // this is the raw path because it's a regex
                }
            }

            config_output.http.routers![routerName] = {
                entryPoints: [
                    resource.ssl
                        ? config.getRawConfig().traefik.https_entrypoint
                        : config.getRawConfig().traefik.http_entrypoint
                ],
                middlewares: routerMiddlewares,
                service: serviceName,
                rule: rule,
                priority: priority,
                ...(resource.ssl ? { tls } : {})
            };

            if (resource.ssl) {
                config_output.http.routers![routerName + "-redirect"] = {
                    entryPoints: [
                        config.getRawConfig().traefik.http_entrypoint
                    ],
                    middlewares: [redirectHttpsMiddlewareName],
                    service: serviceName,
                    rule: rule,
                    priority: priority
                };
            }

            config_output.http.services![serviceName] = {
                loadBalancer: {
                    servers: (() => {
                        // Check if any sites are online
                        // THIS IS SO THAT THERE IS SOME IMMEDIATE FEEDBACK
                        // EVEN IF THE SITES HAVE NOT UPDATED YET FROM THE
                        // RECEIVE BANDWIDTH ENDPOINT.

                        // TODO: HOW TO HANDLE ^^^^^^ BETTER
                        const anySitesOnline = (
                            targets as TargetWithSite[]
                        ).some((target: TargetWithSite) => target.site.online);

                        return (
                            (targets as TargetWithSite[])
                                .filter((target: TargetWithSite) => {
                                    if (!target.enabled) {
                                        return false;
                                    }

                                    // If any sites are online, exclude offline sites
                                    if (anySitesOnline && !target.site.online) {
                                        return false;
                                    }

                                    if (
                                        target.site.type === "local" ||
                                        target.site.type === "wireguard"
                                    ) {
                                        if (
                                            !target.ip ||
                                            !target.port ||
                                            !target.method
                                        ) {
                                            return false;
                                        }
                                    } else if (target.site.type === "newt") {
                                        if (
                                            !target.internalPort ||
                                            !target.method ||
                                            !target.site.subnet
                                        ) {
                                            return false;
                                        }
                                    }
                                    return true;
                                })
                                .map((target: TargetWithSite) => {
                                    if (
                                        target.site.type === "local" ||
                                        target.site.type === "wireguard"
                                    ) {
                                        return {
                                            url: `${target.method}://${target.ip}:${target.port}`
                                        };
                                    } else if (target.site.type === "newt") {
                                        const ip =
                                            target.site.subnet!.split("/")[0];
                                        return {
                                            url: `${target.method}://${ip}:${target.internalPort}`
                                        };
                                    }
                                })
                                // filter out duplicates
                                .filter(
                                    (v, i, a) =>
                                        a.findIndex(
                                            (t) => t && v && t.url === v.url
                                        ) === i
                                )
                        );
                    })(),
                    ...(resource.stickySession
                        ? {
                            sticky: {
                                cookie: {
                                    name: "p_sticky", // TODO: make this configurable via config.yml like other cookies
                                    secure: resource.ssl,
                                    httpOnly: true
                                }
                            }
                        }
                        : {})
                }
            };

            // Add the serversTransport if TLS server name is provided
            if (resource.tlsServerName) {
                if (!config_output.http.serversTransports) {
                    config_output.http.serversTransports = {};
                }
                config_output.http.serversTransports![transportName] = {
                    serverName: resource.tlsServerName,
                    //unfortunately the following needs to be set. traefik doesn't merge the default serverTransport settings
                    // if defined in the static config and here. if not set, self-signed certs won't work
                    insecureSkipVerify: true
                };
                config_output.http.services![
                    serviceName
                ].loadBalancer.serversTransport = transportName;
            }
        } else {
            // Non-HTTP (TCP/UDP) configuration
            if (!resource.enableProxy || !resource.proxyPort) {
                continue;
            }

            const protocol = resource.protocol.toLowerCase();
            const port = resource.proxyPort;

            if (!port) {
                continue;
            }

            if (!config_output[protocol]) {
                config_output[protocol] = {
                    routers: {},
                    services: {}
                };
            }

            config_output[protocol].routers[routerName] = {
                entryPoints: [`${protocol}-${port}`],
                service: serviceName,
                ...(protocol === "tcp" ? { rule: "HostSNI(`*`)" } : {})
            };

            const ppPrefix = config.getRawConfig().traefik.pp_transport_prefix;

            config_output[protocol].services[serviceName] = {
                loadBalancer: {
                    servers: (() => {
                        // Check if any sites are online
                        const anySitesOnline = (
                            targets as TargetWithSite[]
                        ).some((target: TargetWithSite) => target.site.online);

                        return (targets as TargetWithSite[])
                            .filter((target: TargetWithSite) => {
                                if (!target.enabled) {
                                    return false;
                                }

                                // If any sites are online, exclude offline sites
                                if (anySitesOnline && !target.site.online) {
                                    return false;
                                }

                                if (
                                    target.site.type === "local" ||
                                    target.site.type === "wireguard"
                                ) {
                                    if (!target.ip || !target.port) {
                                        return false;
                                    }
                                } else if (target.site.type === "newt") {
                                    if (
                                        !target.internalPort ||
                                        !target.site.subnet
                                    ) {
                                        return false;
                                    }
                                }
                                return true;
                            })
                            .map((target: TargetWithSite) => {
                                if (
                                    target.site.type === "local" ||
                                    target.site.type === "wireguard"
                                ) {
                                    return {
                                        address: `${target.ip}:${target.port}`
                                    };
                                } else if (target.site.type === "newt") {
                                    const ip =
                                        target.site.subnet!.split("/")[0];
                                    return {
                                        address: `${ip}:${target.internalPort}`
                                    };
                                }
                            });
                    })(),
                    ...(resource.proxyProtocol && protocol == "tcp"
                        ? {
                            serversTransport: `${ppPrefix}${resource.proxyProtocolVersion || 1}@file` // TODO: does @file here cause issues?
                        }
                        : {}),
                    ...(resource.stickySession
                        ? {
                            sticky: {
                                ipStrategy: {
                                    depth: 0,
                                    sourcePort: true
                                }
                            }
                        }
                        : {})
                }
            };
        }
    }
    return config_output;
}
