# Implementation Plan: Component Fields & Combobox

**Spec:** `docs/superpowers/specs/2026-07-04-component-fields-combobox-design.md`

## Tasks

1. **shared** — extend Zod schemas, CSV columns, tests
2. **server** — Drizzle columns, migration, CRUD + CSV, `GET /api/field-suggestions`
3. **client** — shadcn Combobox, `ComboboxField`, form helpers, `ComponentForm`, API hook
4. **verify** — `npm run -w shared build`, `npm run -w server db:migrate`, `vp check`, `npm test`

## Branch

`cursor/component-fields-combobox-b97b`
