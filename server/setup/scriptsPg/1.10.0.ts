import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.10.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`
            BEGIN;

            -- Make siteId nullable in targets table
            ALTER TABLE "targets" ALTER COLUMN "siteId" DROP NOT NULL;

            COMMIT;
        `);

        console.log(`Migrated targets table to make siteId nullable`);
    } catch (e) {
        console.log("Unable to migrate targets table");
        console.log(e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
