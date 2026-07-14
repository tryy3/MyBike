import "../src/load-env.js";
import { eq, sql } from "drizzle-orm";
import { applyMigrations } from "../src/db/migrate.js";
import { db, initDatabase } from "../src/db/index.js";
import { bikes, stravaBikes } from "../src/db/schema.js";
import { migrateComponentBaselines } from "../src/lib/component-wear.js";

await initDatabase();
await applyMigrations();

const linkedBikes = await db
  .select({
    id: bikes.id,
    userId: bikes.userId,
    stravaGearId: bikes.stravaGearId,
    updatedAt: bikes.updatedAt,
  })
  .from(bikes)
  .where(sql`${bikes.stravaGearId} IS NOT NULL`)
  .all();

for (const bike of linkedBikes) {
  if (!bike.stravaGearId) continue;
  const existing = await db
    .select({ id: stravaBikes.id })
    .from(stravaBikes)
    .where(eq(stravaBikes.bikeId, bike.id))
    .get();
  if (existing) continue;

  const creditFrom = new Date(bike.updatedAt).toISOString().slice(0, 10);
  await db
    .insert(stravaBikes)
    .values({
      userId: bike.userId,
      stravaGearId: bike.stravaGearId,
      bikeId: bike.id,
      linkedAt: bike.updatedAt,
      componentCreditFrom: creditFrom,
    })
    .run();
}

const { updated } = await migrateComponentBaselines();
console.log(`Wear baseline migration complete. Updated ${updated} component(s).`);
