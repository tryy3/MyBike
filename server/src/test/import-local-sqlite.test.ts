import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vite-plus/test";
import { importDoneMarkerPath, readFileImportMarker } from "../db/import-local-sqlite.js";

describe("import-local-sqlite markers", () => {
  it("reads completion marker from file next to local db", () => {
    const dir = mkdtempSync(join(tmpdir(), "mybike-import-"));
    const dbPath = join(dir, "mybike.db");
    writeFileSync(dbPath, "");
    writeFileSync(importDoneMarkerPath(dbPath), "completed\n", "utf8");

    expect(readFileImportMarker(dbPath)).toBe("completed");
    expect(importDoneMarkerPath(dbPath)).toBe(`${dbPath}.imported`);
  });
});
