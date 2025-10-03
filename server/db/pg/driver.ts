import { drizzle as DrizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readConfigFile } from "@server/lib/readConfigFile";
import { withReplicas } from "drizzle-orm/pg-core";
import * as schema from "./schema";

function createDb() {
    const config = readConfigFile();

    if (!config.postgres) {
        // check the environment variables for postgres config
        if (process.env.POSTGRES_CONNECTION_STRING) {
            config.postgres = {
                connection_string: process.env.POSTGRES_CONNECTION_STRING
            };
            if (process.env.POSTGRES_REPLICA_CONNECTION_STRINGS) {
                const replicas = process.env.POSTGRES_REPLICA_CONNECTION_STRINGS.split(",").map((conn) => ({
                    connection_string: conn.trim()
                }));
                config.postgres.replicas = replicas;
            }
        } else {
            throw new Error(
                "Postgres configuration is missing in the configuration file."
            );
        }
    }

    const connectionString = config.postgres?.connection_string;
    const replicaConnections = config.postgres?.replicas || [];

    if (!connectionString) {
        throw new Error(
            "A primary db connection string is required in the configuration file."
        );
    }

    // Create connection pools instead of individual connections
    const primaryPool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });

    const replicas = [];

    if (!replicaConnections.length) {
        replicas.push(DrizzlePostgres(primaryPool, { schema }));
    } else {
        for (const conn of replicaConnections) {
            const replicaPool = new Pool({
                connectionString: conn.connection_string,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
            replicas.push(DrizzlePostgres(replicaPool, { schema }));
        }
    }

    return withReplicas(DrizzlePostgres(primaryPool, { schema }), replicas as any);
}

export const db = createDb();
export default db;
export type Transaction = Parameters<Parameters<typeof db["transaction"]>[0]>[0];