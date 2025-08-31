import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.10.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");
        db.transaction(() => {
            // 1. Rename old table
            db.exec(`
                ALTER TABLE targets RENAME TO targets_old;
            `);

            // 2. Recreate table with siteId nullable
            db.exec(`
                CREATE TABLE targets (
                    targetId INTEGER PRIMARY KEY AUTOINCREMENT,
                    resourceId INTEGER NOT NULL REFERENCES resources(resourceId) ON DELETE CASCADE,
                    siteId INTEGER REFERENCES sites(siteId) ON DELETE CASCADE, -- now nullable
                    ip TEXT NOT NULL,
                    method TEXT,
                    port INTEGER NOT NULL,
                    internalPort INTEGER,
                    enabled INTEGER NOT NULL DEFAULT 1
                );
            `);

            // 3. Copy data over
            db.exec(`
                INSERT INTO targets (targetId, resourceId, siteId, ip, method, port, internalPort, enabled)
                SELECT targetId, resourceId, siteId, ip, method, port, internalPort, enabled
                FROM targets_old;
            `);

            // 4. Drop old table
            db.exec(`DROP TABLE targets_old;`);
        })();

        db.pragma("foreign_keys = ON");
        console.log(`Migrated targets table to make siteId nullable`);
    } catch (e) {
        console.log("Unable to migrate targets table");
        console.log(e);
    }

    console.log(`${version} migration complete`);
}
