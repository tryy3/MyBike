import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  CATEGORIES,
  COMPONENT_CSV_COLUMNS,
  COMPONENT_CSV_LEGACY_COLUMNS,
  COMPONENT_IMPORT_MAX_BYTES,
  categoryLabel,
  componentInsertSchema,
  componentUpdateSchema,
} from "shared";
import { db } from "../db/index.js";
import { bikes, components } from "../db/schema.js";
import type { ComponentRow } from "../db/schema.js";
import { HttpError, badRequest } from "../lib/errors.js";
import { requireBike } from "./bikes.js";

const CATEGORY_ORDER = new Map(CATEGORIES.map((c, i) => [c.id, i]));
const IMPORT_MAX_ROWS = 1000;

function escapeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function matchCsvHeader(header: string[]): "full" | "legacy" | null {
  if (
    header.length === COMPONENT_CSV_COLUMNS.length &&
    header.every((h, i) => h === COMPONENT_CSV_COLUMNS[i])
  ) {
    return "full";
  }
  if (
    header.length === COMPONENT_CSV_LEGACY_COLUMNS.length &&
    header.every((h, i) => h === COMPONENT_CSV_LEGACY_COLUMNS[i])
  ) {
    return "legacy";
  }
  return null;
}

function padCsvRow(raw: string[], mode: "full" | "legacy"): string[] {
  if (mode === "full") return raw;
  return [...raw, "", "", "", "", ""];
}

function parseOptionalInt(raw: string): number | null | "invalid" {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

function parseOptionalCost(raw: string): number | null | "invalid" {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

export interface ComponentExportResult {
  csv: string;
  filename: string;
}

export async function exportComponentsCsv(
  bikeId: string,
  userId: string,
): Promise<ComponentExportResult> {
  const bike = await requireBike(bikeId, userId);
  const rows = await db.select().from(components).where(eq(components.bikeId, bikeId)).all();
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
    distanceMeters: r.distanceMeters ?? "",
    movingTimeMinutes: r.movingTimeMinutes ?? "",
    purchaseDate: escapeCsvCell(r.purchaseDate ?? ""),
    purchaseCost: r.purchaseCost ?? "",
    purchaseStore: escapeCsvCell(r.purchaseStore ?? ""),
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
  return { csv, filename: `${slug}-components.csv` };
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
  distanceMeters: number | null;
  movingTimeMinutes: number | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  purchaseStore: string | null;
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
  distanceMeters: number | null;
  movingTimeMinutes: number | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  purchaseStore: string | null;
}

export interface ImportComponentsResult {
  bikeId: string;
  inserted: number;
  updated: number;
  dryRun?: boolean;
}

export async function importComponentsFromCsv(
  bikeId: string,
  userId: string,
  csvText: string,
  dryRun = false,
): Promise<ImportComponentsResult> {
  await requireBike(bikeId, userId);

  if (csvText.length > COMPONENT_IMPORT_MAX_BYTES) {
    throw badRequest(`CSV is too large (max ${COMPONENT_IMPORT_MAX_BYTES} bytes)`);
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
  const headerMode = matchCsvHeader(header);
  if (headerMode === null) {
    throw badRequest(
      `Header row must be exactly: ${COMPONENT_CSV_COLUMNS.join(",")} (legacy ${COMPONENT_CSV_LEGACY_COLUMNS.join(",")} also accepted)`,
    );
  }
  const dataRows = records.slice(1);
  if (dataRows.length === 0) throw badRequest("No data rows to import");
  if (dataRows.length > IMPORT_MAX_ROWS) {
    throw badRequest(`Too many rows (max ${IMPORT_MAX_ROWS})`);
  }

  const errors: { row: number; message: string }[] = [];
  const ops: (InsertOp | UpdateOp)[] = [];
  const addError = (row: number, message: string) => errors.push({ row, message });

  for (let i = 0; i < dataRows.length; i++) {
    const raw = padCsvRow(dataRows[i], headerMode);
    const row = i + 2;
    if (raw.length !== COMPONENT_CSV_COLUMNS.length) {
      addError(row, `Expected ${COMPONENT_CSV_COLUMNS.length} columns, got ${raw.length}`);
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
      distanceMetersRaw,
      movingTimeMinutesRaw,
      purchaseDateRaw,
      purchaseCostRaw,
      purchaseStoreRaw,
    ] = raw;
    const id = idRaw;
    const category = categoryRaw;
    const name = nameRaw;
    const brand = brandRaw === "" ? null : brandRaw;
    const model = modelRaw === "" ? null : modelRaw;
    const notes = notesRaw === "" ? null : notesRaw;
    const purchaseDate = purchaseDateRaw === "" ? null : purchaseDateRaw;
    const purchaseStore = purchaseStoreRaw === "" ? null : purchaseStoreRaw;

    const distanceMeters = parseOptionalInt(distanceMetersRaw);
    if (distanceMeters === "invalid") {
      addError(row, "distanceMeters must be a non-negative integer");
      continue;
    }
    const movingTimeMinutes = parseOptionalInt(movingTimeMinutesRaw);
    if (movingTimeMinutes === "invalid") {
      addError(row, "movingTimeMinutes must be a non-negative integer");
      continue;
    }
    const purchaseCost = parseOptionalCost(purchaseCostRaw);
    if (purchaseCost === "invalid") {
      addError(row, "purchaseCost must be a non-negative number");
      continue;
    }

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
      const parsed = componentInsertSchema.safeParse({
        category,
        name,
        brand,
        model,
        notes,
        isActive,
        distanceMeters,
        movingTimeMinutes,
        purchaseDate,
        purchaseCost,
        purchaseStore,
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
        distanceMeters: parsed.data.distanceMeters ?? null,
        movingTimeMinutes: parsed.data.movingTimeMinutes ?? null,
        purchaseDate: parsed.data.purchaseDate ?? null,
        purchaseCost: parsed.data.purchaseCost ?? null,
        purchaseStore: parsed.data.purchaseStore ?? null,
      });
    } else {
      const rowForBike = await db
        .select({ component: components })
        .from(components)
        .innerJoin(bikes, eq(components.bikeId, bikes.id))
        .where(and(eq(components.id, id), eq(components.bikeId, bikeId), eq(bikes.userId, userId)))
        .get();
      const existing = rowForBike?.component;
      if (!existing) {
        addError(
          row,
          "The id column can only update an existing component on this bike. Leave it empty to import as a new component.",
        );
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
        distanceMeters,
        movingTimeMinutes,
        purchaseDate,
        purchaseCost,
        purchaseStore,
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
        distanceMeters: parsed.data.distanceMeters ?? null,
        movingTimeMinutes: parsed.data.movingTimeMinutes ?? null,
        purchaseDate: parsed.data.purchaseDate ?? null,
        purchaseCost: parsed.data.purchaseCost ?? null,
        purchaseStore: parsed.data.purchaseStore ?? null,
      });
    }
  }

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

  if (dryRun) {
    return { bikeId, dryRun: true, inserted, updated };
  }

  await db.transaction(async (tx) => {
    for (const op of ops) {
      if (op.kind === "insert") {
        const existingCount = (
          await tx
            .select({ c: components.id })
            .from(components)
            .where(and(eq(components.bikeId, bikeId), eq(components.category, op.category)))
            .all()
        ).length;
        const isActive = existingCount === 0 ? true : op.isActive;
        if (isActive) {
          await tx
            .update(components)
            .set({ isActive: false })
            .where(and(eq(components.bikeId, bikeId), eq(components.category, op.category)))
            .run();
        }
        const maxOrder = await tx
          .select({
            max: sql<number | null>`max(${components.sortOrder})`.as("max"),
          })
          .from(components)
          .where(and(eq(components.bikeId, bikeId), eq(components.category, op.category)))
          .get();
        const sortOrder = (maxOrder?.max ?? -1) + 1;
        await tx
          .insert(components)
          .values({
            bikeId,
            category: op.category,
            name: op.name,
            brand: op.brand,
            model: op.model,
            notes: op.notes,
            distanceMeters: op.distanceMeters,
            movingTimeMinutes: op.movingTimeMinutes,
            purchaseDate: op.purchaseDate,
            purchaseCost: op.purchaseCost,
            purchaseStore: op.purchaseStore,
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
          distanceMeters: op.distanceMeters,
          movingTimeMinutes: op.movingTimeMinutes,
          purchaseDate: op.purchaseDate,
          purchaseCost: op.purchaseCost,
          purchaseStore: op.purchaseStore,
        };
        if (op.isActiveExplicit) {
          updates.isActive = op.isActive;
          if (op.isActive) {
            await tx
              .update(components)
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
        await tx.update(components).set(updates).where(eq(components.id, op.id)).run();
      }
    }
  });

  return { bikeId, inserted, updated };
}
