import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as net from "net";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";

const tcpCheckSchema = z
    .object({
        host: z.string().min(1, "Host is required"),
        port: z.number().int().min(1).max(65535),
        timeout: z.number().int().min(1000).max(30000).optional().default(5000)
    })
    .strict();

export type TcpCheckResponse = {
    connected: boolean;
    host: string;
    port: number;
    responseTime?: number;
    error?: string;
};

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/resources/tcp-check",
    description: "Check TCP connectivity to a host and port",
    tags: [OpenAPITags.Resource],
    request: {
        body: {
            content: {
                "application/json": {
                    schema: tcpCheckSchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "TCP check result",
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                        data: z.object({
                            connected: z.boolean(),
                            host: z.string(),
                            port: z.number(),
                            responseTime: z.number().optional(),
                            error: z.string().optional()
                        }),
                        message: z.string()
                    })
                }
            }
        }
    }
});

function checkTcpConnection(host: string, port: number, timeout: number): Promise<TcpCheckResponse> {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();

        const cleanup = () => {
            socket.removeAllListeners();
            if (!socket.destroyed) {
                socket.destroy();
            }
        };

        const timer = setTimeout(() => {
            cleanup();
            resolve({
                connected: false,
                host,
                port,
                error: 'Connection timeout'
            });
        }, timeout);

        socket.setTimeout(timeout);

        socket.on('connect', () => {
            const responseTime = Date.now() - startTime;
            clearTimeout(timer);
            cleanup();
            resolve({
                connected: true,
                host,
                port,
                responseTime
            });
        });

        socket.on('error', (error) => {
            clearTimeout(timer);
            cleanup();
            resolve({
                connected: false,
                host,
                port,
                error: error.message
            });
        });

        socket.on('timeout', () => {
            clearTimeout(timer);
            cleanup();
            resolve({
                connected: false,
                host,
                port,
                error: 'Socket timeout'
            });
        });

        try {
            socket.connect(port, host);
        } catch (error) {
            clearTimeout(timer);
            cleanup();
            resolve({
                connected: false,
                host,
                port,
                error: error instanceof Error ? error.message : 'Unknown connection error'
            });
        }
    });
}

export async function tcpCheck(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = tcpCheckSchema.safeParse(req.body);

        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { host, port, timeout } = parsedBody.data;


        const result = await checkTcpConnection(host, port, timeout);

        logger.info(`TCP check for ${host}:${port} - Connected: ${result.connected}`, {
            host,
            port,
            connected: result.connected,
            responseTime: result.responseTime,
            error: result.error
        });

        return response<TcpCheckResponse>(res, {
            data: result,
            success: true,
            error: false,
            message: `TCP check completed for ${host}:${port}`,
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("TCP check error:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred during TCP check"
            )
        );
    }
}

// Batch TCP check endpoint for checking multiple resources at once
const batchTcpCheckSchema = z
    .object({
        checks: z.array(z.object({
            id: z.number().int().positive(),
            host: z.string().min(1),
            port: z.number().int().min(1).max(65535)
        })).max(50), // Limit to 50 concurrent checks
        timeout: z.number().int().min(1000).max(30000).optional().default(5000)
    })
    .strict();

export type BatchTcpCheckResponse = {
    results: Array<TcpCheckResponse & { id: number }>;
};

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/resources/tcp-check-batch",
    description: "Check TCP connectivity to multiple hosts and ports",
    tags: [OpenAPITags.Resource],
    request: {
        body: {
            content: {
                "application/json": {
                    schema: batchTcpCheckSchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "Batch TCP check results",
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                        data: z.object({
                            results: z.array(z.object({
                                id: z.number(),
                                connected: z.boolean(),
                                host: z.string(),
                                port: z.number(),
                                responseTime: z.number().optional(),
                                error: z.string().optional()
                            }))
                        }),
                        message: z.string()
                    })
                }
            }
        }
    }
});

export async function batchTcpCheck(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = batchTcpCheckSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { checks, timeout } = parsedBody.data;

        // all TCP checks concurrently
        const checkPromises = checks.map(async (check) => {
            const result = await checkTcpConnection(check.host, check.port, timeout);
            return {
                id: check.id,
                ...result
            };
        });

        const results = await Promise.all(checkPromises);

        logger.info(`Batch TCP check completed for ${checks.length} resources`, {
            totalChecks: checks.length,
            successfulConnections: results.filter(r => r.connected).length,
            failedConnections: results.filter(r => !r.connected).length
        });

        return response<BatchTcpCheckResponse>(res, {
            data: { results },
            success: true,
            error: false,
            message: `Batch TCP check completed for ${checks.length} resources`,
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Batch TCP check error:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred during batch TCP check"
            )
        );
    }
}