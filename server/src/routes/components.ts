import { Router } from "express";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { db } from "../db/index";
import { bikes, components } from "../db/schema";
import type { ComponentRow } from "../db/schema";
import {
  CATEGORIES,
  COMPONENT_CSV_COLUMNS,
  categoryLabel,
  componentInsertSchema,
  componentImportSchema,
  componentReorderSchema,
  componentUpdateSchema,
} from "shared";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { requireAuth, getAuthContext } from "../lib/require-auth";
import { parseBody, parseParams } from "../lib/validation";

export const componentsRouter = Router({ mergeParams: true });

componentsRouter.use(requireAuth);

// Order categories by their predefined `order` for CSV export. Any unknown id
// (shouldn't happen since the enum is enforced) sorts last.
const CATEGORY_ORDER = new Map(CATEGORIES.map((c, i) => [c.id, i]));

// Max rows (data rows, excluding the header) accepted by the import endpoint.
const IMPORT_MAX_ROWS = 1000;
// Max raw CSV byte length accepted by the import endpoint.
const IMPORT_MAX_BYTES = 256 * 1024;

function requireBikeExists(bikeId: string, userId: string) {
  const bike = db
    .select()
    .from(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .get();
  if (!bike) throw notFound("Bike");
  return bike;
}

function requireComponentExists(componentId: string, userId: string) {
  const row = db
    .select({ component: components })
    .from(components)
    .innerJoin(bikes, eq(components.bikeId, bikes.id))
    .where(and(eq(components.id, componentId), eq(bikes.userId, userId)))
    .get();
  if (!row) throw notFound("Component");
  return row.component;
}

function escapeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

// GET /api/bikes/:bikeId/components/export.csv
componentsRouter.get("/export.csv", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  const bike = requireBikeExists(bikeId, userId);
  const rows = db
    .select()
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .all();
  rows.sort((a, b) => {
    const oa = CATEGORY_ORDER.get(a.category) ?? Number.MAX_SAFE_INTEGER;
    const ob = CATEGORY_ORDER.get(b.category) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt - b.createdAt;
  });
  const data = rows.map((r) => ({
    id: r.id,
    category: r.category,
    name: escapeCsvCell(r.name),
    brand: escapeCsvCell(r.brand ?? ""),
    model: escapeCsvCell(r.model ?? ""),
    notes: escapeCsvCell(r.notes ?? ""),
    isActive: r.isActive ? "true" : "false",
  }));
  const csv = stringify(data, {
    header: true,
    columns: [...COMPONENT_CSV_COLUMNS],
  });
  const slug =
    bike.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bike";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${slug}-components.csv"`,
  );
  res.send(csv);
});

// POST /api/bikes/:bikeId/components/import — upsert components from a CSV
// string sent in the JSON body as `{ csv: string }`. Rows with an empty `id`
// insert new components; rows with an `id` update the matching component. The
// entire import runs in one transaction: if any row fails validation the whole
// import is rejected and nothing is saved.
componentsRouter.post("/import", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  requireBikeExists(bikeId, userId);

  const { csv: csvText, dryRun = false } = parseBody(req, componentImportSchema);
  if (csvText.length > IMPORT_MAX_BYTES) {
    throw badRequest(`CSV is too large (max ${IMPORT_MAX_BYTES} bytes)`);
  }

  let records: string[][];
  try {
    records = parse(csvText, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    throw badRequest("Could not parse CSV", { detail: (e as Error).message });
  }
  if (records.length === 0) {
    throw badRequest("CSV has no rows (not even a header)");
  }

  const header = records[0];
  if (
    header.length !== COMPONENT_CSV_COLUMNS.length ||
    !header.every((h, i) => h === COMPONENT_CSV_COLUMNS[i])
  ) {
    throw badRequest(
      `Header row must be exactly: ${COMPONENT_CSV_COLUMNS.join(",")}`,
    );
  }
  const dataRows = records.slice(1);
  if (dataRows.length === 0) throw badRequest("No data rows to import");
  if (dataRows.length > IMPORT_MAX_ROWS) {
    throw badRequest(`Too many rows (max ${IMPORT_MAX_ROWS})`);
  }

  interface InsertOp {
    kind: "insert";
    row: number;
    category: string;
    name: string;
    brand: string | null;
    model: string | null;
    notes: string | null;
    isActive: boolean;
  }
  interface UpdateOp {
    kind: "update";
    row: number;
    id: string;
    existing: ComponentRow;
    name: string;
    brand: string | null;
    model: string | null;
    notes: string | null;
    isActiveExplicit: boolean;
    isActive: boolean;
  }

  const errors: { row: number; message: string }[] = [];
  const ops: (InsertOp | UpdateOp)[] = [];
  const addError = (row: number, message: string) =>
    errors.push({ row, message });

  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i];
    // +2: 1-indexed, and the header is row 1.
    const row = i + 2;
    if (raw.length !== COMPONENT_CSV_COLUMNS.length) {
      addError(
        row,
        `Expected ${COMPONENT_CSV_COLUMNS.length} columns, got ${raw.length}`,
      );
      continue;
    }
    const [
      idRaw,
      categoryRaw,
      nameRaw,
      brandRaw,
      modelRaw,
      notesRaw,
      isActiveRaw,
    ] = raw;
    const id = idRaw;
    const category = categoryRaw;
    const name = nameRaw;
    const brand = brandRaw === "" ? null : brandRaw;
    const model = modelRaw === "" ? null : modelRaw;
    const notes = notesRaw === "" ? null : notesRaw;

    const ia = isActiveRaw.toLowerCase();
    let isActive: boolean;
    let isActiveExplicit: boolean;
    if (ia === "true" || ia === "1") {
      isActive = true;
      isActiveExplicit = true;
    } else if (ia === "false" || ia === "0" || ia === "") {
      isActive = false;
      isActiveExplicit = ia !== "";
    } else {
      addError(row, `isActive must be true/false/1/0 (got "${isActiveRaw}")`);
      continue;
    }

    if (id === "") {
      // Insert.
      const parsed = componentInsertSchema.safeParse({
        category,
        name,
        brand,
        model,
        notes,
        isActive,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          addError(row, `${issue.path.join(".") || "row"}: ${issue.message}`);
        }
        continue;
      }
      ops.push({
        kind: "insert",
        row,
        category: parsed.data.category,
        name: parsed.data.name,
        brand: parsed.data.brand ?? null,
        model: parsed.data.model ?? null,
        notes: parsed.data.notes ?? null,
        isActive,
      });
    } else {
      // Update.
      const existing = db
        .select()
        .from(components)
        .where(eq(components.id, id))
        .get();
      if (!existing) {
        addError(
          row,
          `No component with id "${id}" exists. Leave the id column empty to import as a new component.`,
        );
        continue;
      }
      if (existing.bikeId !== bikeId) {
        addError(row, `Component "${id}" does not belong to this bike.`);
        continue;
      }
      if (category !== existing.category) {
        addError(
          row,
          `Category "${category}" does not match this component's existing category "${existing.category}". Category is immutable after creation.`,
        );
        continue;
      }
      const parsed = componentUpdateSchema.safeParse({
        name,
        brand,
        model,
        notes,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          addError(row, `${issue.path.join(".") || "row"}: ${issue.message}`);
        }
        continue;
      }
      ops.push({
        kind: "update",
        row,
        id,
        existing,
        name: parsed.data.name ?? existing.name,
        brand: parsed.data.brand ?? null,
        model: parsed.data.model ?? null,
        notes: parsed.data.notes ?? null,
        isActiveExplicit,
        isActive,
      });
    }
  }

  // Across the whole import, at most one row per category may be marked active.
  const activeByCategory = new Map<string, number>();
  for (const op of ops) {
    if (op.isActive) {
      const cat = op.kind === "insert" ? op.category : op.existing.category;
      activeByCategory.set(cat, (activeByCategory.get(cat) ?? 0) + 1);
    }
  }
  for (const [cat, count] of activeByCategory) {
    if (count > 1) {
      addError(
        0,
        `Multiple imported rows are marked active in category "${categoryLabel(cat)}" — only one active component per category is allowed.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new HttpError(400, "Import validation failed", errors);
  }

  const inserted = ops.filter((o) => o.kind === "insert").length;
  const updated = ops.filter((o) => o.kind === "update").length;

  // Dry-run: report what would happen without committing. The pre-pass above
  // already validated every row, so these counts are final.
  if (dryRun) {
    res.status(200).json({ dryRun: true, inserted, updated });
    return;
  }

  db.transaction((tx) => {
    for (const op of ops) {
      if (op.kind === "insert") {
        const existingCount = tx
          .select({ c: components.id })
          .from(components)
          .where(
            and(
              eq(components.bikeId, bikeId),
              eq(components.category, op.category),
            ),
          )
          .all().length;
        // Mirror POST: the first component in a (bike, category) is
        // auto-activated so a category always has exactly one active part.
        const isActive = existingCount === 0 ? true : op.isActive;
        if (isActive) {
          tx.update(components)
            .set({ isActive: false })
            .where(
              and(
                eq(components.bikeId, bikeId),
                eq(components.category, op.category),
              ),
            )
            .run();
        }
        const maxOrder = tx
          .select({
            max: sql<number | null>`max(${components.sortOrder})`.as("max"),
          })
          .from(components)
          .where(
            and(
              eq(components.bikeId, bikeId),
              eq(components.category, op.category),
            ),
          )
          .get();
        const sortOrder = (maxOrder?.max ?? -1) + 1;
        tx.insert(components)
          .values({
            bikeId,
            category: op.category,
            name: op.name,
            brand: op.brand,
            model: op.model,
            notes: op.notes,
            isActive,
            sortOrder,
          })
          .run();
      } else {
        const updates: Record<string, unknown> = {
          name: op.name,
          brand: op.brand,
          model: op.model,
          notes: op.notes,
        };
        if (op.isActiveExplicit) {
          updates.isActive = op.isActive;
          if (op.isActive) {
            tx.update(components)
              .set({ isActive: false })
              .where(
                and(
                  eq(components.bikeId, bikeId),
                  eq(components.category, op.existing.category),
                  ne(components.id, op.id),
                ),
              )
              .run();
          }
        }
        tx.update(components)
          .set(updates)
          .where(eq(components.id, op.id))
          .run();
      }
    }
  });

  res.status(201).json({ bikeId, inserted, updated });
});

// POST /api/bikes/:bikeId/components
componentsRouter.post("/", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  requireBikeExists(bikeId, userId);
  const data = parseBody(req, componentInsertSchema);
  const existingCount = db
    .select({ c: components.id })
    .from(components)
    .where(
      and(
        eq(components.bikeId, bikeId),
        eq(components.category, data.category),
      ),
    )
    .all().length;
  // First component in a (bike, category) is auto-activated so a category
  // always has exactly one active component once it has any at all.
  const isActive = existingCount === 0 ? true : data.isActive;
  const created = db.transaction((tx) => {
    if (isActive && existingCount > 0) {
      tx.update(components)
        .set({ isActive: false })
        .where(
          and(
            eq(components.bikeId, bikeId),
            eq(components.category, data.category),
          ),
        )
        .run();
    }
    const maxOrder = tx
      .select({
        max: sql<number | null>`max(${components.sortOrder})`.as("max"),
      })
      .from(components)
      .where(
        and(
          eq(components.bikeId, bikeId),
          eq(components.category, data.category),
        ),
      )
      .get();
    const sortOrder = (maxOrder?.max ?? -1) + 1;
    return tx
      .insert(components)
      .values({
        bikeId,
        category: data.category,
        name: data.name,
        brand: data.brand ?? null,
        model: data.model ?? null,
        notes: data.notes ?? null,
        isActive,
        sortOrder,
      })
      .returning()
      .get();
  });
  res.status(201).json(created);
});

// PUT /api/components/:id  (mounted at /api/components)
componentsRouter.put("/:id", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  requireComponentExists(id, userId);
  const data = parseBody(req, componentUpdateSchema);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.brand !== undefined) updates.brand = data.brand ?? null;
  if (data.model !== undefined) updates.model = data.model ?? null;
  if (data.notes !== undefined) updates.notes = data.notes ?? null;
  // category and is_active are managed elsewhere; ignore them here.
  if (Object.keys(updates).length === 0) {
    const row = db.select().from(components).where(eq(components.id, id)).get();
    res.json(row);
    return;
  }
  const updated = db
    .update(components)
    .set(updates)
    .where(eq(components.id, id))
    .returning()
    .get();
  res.json(updated);
});

// DELETE /api/components/:id
componentsRouter.delete("/:id", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  const existing = requireComponentExists(id, userId);
  // Delete within a transaction so we can reassign the active flag atomically.
  db.transaction((tx) => {
    const result = tx.delete(components).where(eq(components.id, id)).run();
    if (result.changes === 0) throw notFound("Component");
    if (existing.isActive) {
      // Reassign active flag to the oldest remaining component in the same
      // (bike, category), if any.
      const oldest = tx
        .select()
        .from(components)
        .where(
          and(
            eq(components.bikeId, existing.bikeId),
            eq(components.category, existing.category),
          ),
        )
        .orderBy(asc(components.createdAt))
        .get();
      if (oldest) {
        tx.update(components)
          .set({ isActive: true })
          .where(eq(components.id, oldest.id))
          .run();
      }
    }
  });
  res.status(204).end();
});

// PATCH /api/components/:id/activate — set this component active, others in the
// same (bike, category) inactive.
componentsRouter.patch("/:id/activate", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  const component = requireComponentExists(id, userId);
  db.transaction((tx) => {
    // Deactivate all other components in the same (bike, category).
    tx.update(components)
      .set({ isActive: false })
      .where(
        and(
          eq(components.bikeId, component.bikeId),
          eq(components.category, component.category),
          ne(components.id, id),
        ),
      )
      .run();
    // Activate the chosen one.
    tx.update(components)
      .set({ isActive: true })
      .where(eq(components.id, id))
      .run();
  });
  const updated = db
    .select()
    .from(components)
    .where(eq(components.id, id))
    .get();
  res.json(updated);
});

// PATCH /api/bikes/:bikeId/components/reorder — rewrite sort_order within a
// (bike, category). `orderedIds` must be the complete set of component ids for
// that (bike, category) in the desired order.
componentsRouter.patch("/reorder", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  requireBikeExists(bikeId, userId);
  const data = parseBody(req, componentReorderSchema);
  const rows = db
    .select({ id: components.id })
    .from(components)
    .where(
      and(
        eq(components.bikeId, bikeId),
        eq(components.category, data.category),
      ),
    )
    .all();
  const existingIds = new Set(rows.map((r) => r.id));
  const orderedSet = new Set(data.orderedIds);
  if (
    existingIds.size !== orderedSet.size ||
    rows.length !== data.orderedIds.length
  ) {
    throw new HttpError(
      400,
      "orderedIds must contain each component of this (bike, category) exactly once",
    );
  }
  for (const id of data.orderedIds) {
    if (!existingIds.has(id)) {
      throw new HttpError(
        400,
        `Component ${id} does not belong to this (bike, category)`,
      );
    }
  }
  db.transaction((tx) => {
    data.orderedIds.forEach((id, index) => {
      tx.update(components)
        .set({ sortOrder: index })
        .where(eq(components.id, id))
        .run();
    });
  });
  res.status(204).end();
});

export default componentsRouter;
