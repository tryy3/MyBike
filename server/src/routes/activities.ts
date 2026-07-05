import { Router } from "express";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { ActivityDetail, ActivityList, ActivityListItem } from "shared";
import { activityUpdateSchema } from "shared";
import { db } from "../db/index.js";
import { bikes, components, stravaActivities, stravaActivityComponents } from "../db/schema.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getAuthContext, requireAuth } from "../lib/require-auth.js";
import { parseBody, parseParams } from "../lib/validation.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function nowMs(): number {
  return Date.now();
}

function requireBike(bikeId: string, userId: string) {
  const bike = db
    .select({ id: bikes.id })
    .from(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .get();
  if (!bike) throw notFound("Bike");
  return bike;
}

function requireActivity(activityId: string, userId: string) {
  const row = db
    .select()
    .from(stravaActivities)
    .where(and(eq(stravaActivities.id, activityId), eq(stravaActivities.userId, userId)))
    .get();
  if (!row) throw notFound("Activity");
  return row;
}

function parseLimit(raw: unknown): number {
  if (raw == null || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw badRequest("limit must be a positive integer");
  return Math.min(n, MAX_LIMIT);
}

function parseCursor(raw: unknown): { startDate: string; id: string } | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw badRequest("cursor must be a string");
  const sep = raw.lastIndexOf("|");
  if (sep <= 0) throw badRequest("Invalid cursor");
  const startDate = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!startDate || !id) throw badRequest("Invalid cursor");
  return { startDate, id };
}

function encodeCursor(startDate: string, id: string): string {
  return `${startDate}|${id}`;
}

function loadComponentLinks(activityIds: string[]) {
  if (activityIds.length === 0) {
    return new Map<string, { ids: string[]; names: string[] }>();
  }

  const rows = db
    .select({
      activityId: stravaActivityComponents.activityId,
      componentId: stravaActivityComponents.componentId,
      name: components.name,
    })
    .from(stravaActivityComponents)
    .innerJoin(components, eq(stravaActivityComponents.componentId, components.id))
    .where(inArray(stravaActivityComponents.activityId, activityIds))
    .orderBy(asc(components.sortOrder), asc(components.name))
    .all();

  const map = new Map<string, { ids: string[]; names: string[] }>();
  for (const row of rows) {
    const entry = map.get(row.activityId) ?? { ids: [], names: [] };
    entry.ids.push(row.componentId);
    entry.names.push(row.name);
    map.set(row.activityId, entry);
  }
  return map;
}

function toListItem(
  row: typeof stravaActivities.$inferSelect,
  links: { ids: string[]; names: string[] },
): ActivityListItem {
  return {
    id: row.id,
    startDate: row.startDate,
    distanceMeters: row.distanceMeters,
    movingTimeMinutes: row.movingTimeMinutes,
    componentIds: links.ids,
    componentNames: links.names,
    editedAt: row.editedAt ?? null,
  };
}

export const bikeActivitiesRouter = Router({ mergeParams: true });
bikeActivitiesRouter.use(requireAuth);

bikeActivitiesRouter.get("/", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  requireBike(bikeId, userId);

  const limit = parseLimit(req.query.limit);
  const cursor = parseCursor(req.query.cursor);

  const conditions = [eq(stravaActivities.bikeId, bikeId), eq(stravaActivities.userId, userId)];
  if (cursor) {
    conditions.push(
      or(
        lt(stravaActivities.startDate, cursor.startDate),
        and(eq(stravaActivities.startDate, cursor.startDate), lt(stravaActivities.id, cursor.id)),
      )!,
    );
  }

  const rows = db
    .select()
    .from(stravaActivities)
    .where(and(...conditions))
    .orderBy(desc(stravaActivities.startDate), desc(stravaActivities.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const linksByActivity = loadComponentLinks(page.map((r) => r.id));

  const items = page.map((row) =>
    toListItem(row, linksByActivity.get(row.id) ?? { ids: [], names: [] }),
  );

  const last = page.at(-1);
  const payload: ActivityList = {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.startDate, last.id) : null,
  };

  res.json(payload);
});

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get("/:id", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  const row = requireActivity(id, userId);
  const links = loadComponentLinks([row.id]).get(row.id) ?? { ids: [], names: [] };

  const payload: ActivityDetail = {
    ...toListItem(row, links),
    bikeId: row.bikeId,
  };

  res.json(payload);
});

activityRouter.patch("/:id", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  const data = parseBody(req, activityUpdateSchema);
  const activity = requireActivity(id, userId);

  const uniqueComponentIds = [...new Set(data.componentIds)];
  if (uniqueComponentIds.length !== data.componentIds.length) {
    throw badRequest("componentIds must be unique");
  }

  if (uniqueComponentIds.length > 0) {
    const validComponents = db
      .select({ id: components.id })
      .from(components)
      .where(
        and(eq(components.bikeId, activity.bikeId), inArray(components.id, uniqueComponentIds)),
      )
      .all();

    if (validComponents.length !== uniqueComponentIds.length) {
      throw badRequest("All components must belong to this bike");
    }
  }

  db.transaction((tx) => {
    tx.update(stravaActivities)
      .set({
        distanceMeters: data.distanceMeters,
        movingTimeMinutes: data.movingTimeMinutes,
        editedAt: nowMs(),
      })
      .where(eq(stravaActivities.id, id))
      .run();

    tx.delete(stravaActivityComponents).where(eq(stravaActivityComponents.activityId, id)).run();

    for (const componentId of uniqueComponentIds) {
      tx.insert(stravaActivityComponents)
        .values({
          activityId: id,
          componentId,
          distanceMeters: data.distanceMeters,
          movingTimeMinutes: data.movingTimeMinutes,
        })
        .run();
    }
  });

  const updated = requireActivity(id, userId);
  const links = loadComponentLinks([updated.id]).get(updated.id) ?? { ids: [], names: [] };

  const payload: ActivityDetail = {
    ...toListItem(updated, links),
    bikeId: updated.bikeId,
  };

  res.json(payload);
});
