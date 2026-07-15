# Maintenance Module

**Date:** 2026-07-14  
**Status:** Approved (brainstorming)  
**Issue:** [#33 — Service / Maintenance](https://github.com/tryy3/MyBike/issues/33)  
**Builds on:** `2026-07-05-activity-component-wear-design.md`, `2026-07-05-strava-stats-display-design.md`

## Summary

Add a maintenance module covering three task categories in one release: **touch-up checklists**, **periodic service reminders**, and **replacement / end-of-life (EOL) alerts**. Notifications (push, email, post-ride pings) are explicitly deferred.

Tasks use a **unified model** (`maintenance_tasks`) with a `kind` discriminator so future kinds can be added without schema churn. Built-in tasks are **auto-seeded** when a bike is created; users can **customize or disable** built-ins but not delete them. **Custom tasks** are fully user-owned and deletable.

Due status for periodic and EOL tasks is computed server-side from component wear (Strava ledger + baseline), time since last service, and snooze state. Completing or replacing a component task creates a **service record**; EOL replace can prompt component swap and optional wear reset.

UI combines **embedded alert badges** (garage list, bike header, component rows — ProBikeGarage-style) with a dedicated **Maintenance tab** on bike detail (Bambuddy-style task management and service history).

## Goals

- Seed sensible default maintenance tasks when a user creates a bike
- Support bike-level touch-up checklists (on-demand, no due alerts)
- Support component-linked periodic tasks with per-task triggers: distance only, time only, or both (whichever comes first)
- Support component-linked EOL tasks based on absolute component wear limits
- Allow users to enable/disable any periodic or EOL task
- Allow users to add custom tasks and delete only custom tasks
- Track whether built-in tasks have been **customized**; sync template updates only to non-customized built-ins; offer **reset to default**
- Optional guide URL per task (external how-to link)
- Snooze due tasks via user-selected presets (km or days)
- Complete / replace flows create service records; replace integrates with existing `activateComponent` and optional wear reset
- Expose alert counts for badge UI across garage, bike, and component surfaces
- GraphQL API following existing MyBike patterns (`shared` Zod → service → Pothos)

## Non-goals (v1)

- Push notifications, email, weekly reports, post-ride pings (noted in issue for later)
- Time-based touch-up reminders (touch-ups are checklist-only in v1)
- Chain/cassette wear coupling or drivetrain dependency modeling
- Automatic inference of service intervals from purchase date alone (use explicit last-service from completions)
- Maintenance MCP tools (can follow in a later pass)
- Per-user unit preferences (km only, matching existing stats UI)

## Decisions log (brainstorming)

| Topic          | Decision                                                  |
| -------------- | --------------------------------------------------------- |
| Scope          | All three categories in one release                       |
| Architecture   | Unified `maintenance_tasks` table (Approach A)            |
| Defaults       | Auto-seed on bike creation                                |
| Attachment     | Bike-level touch-ups; component category for periodic/EOL |
| Touch-ups      | Optional checklist only — no due dates or alerts          |
| EOL replace    | Service record + swap prompt + optional wear reset        |
| UI             | Maintenance tab + embedded alert badges                   |
| Triggers       | Per task: distance, time, or both (whichever first)       |
| Snooze         | User picks from presets                                   |
| Guide links    | Optional URL on any task                                  |
| Built-in tasks | Customizable, disable-able, not deletable                 |
| Custom tasks   | Full CRUD including delete                                |
| Template sync  | Update non-customized built-ins when app templates change |

## Concepts

| Term               | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Built-in task**  | Copied from system template at bike creation; identified by stable `templateKey`              |
| **Custom task**    | User-created; `source: custom`; deletable                                                     |
| **Customized**     | User edited template-owned fields on a built-in; blocks automatic template sync for that task |
| **Periodic task**  | Interval since last service (distance and/or time)                                            |
| **EOL task**       | Absolute wear limit on active component in linked category                                    |
| **Touch-up task**  | Bike-level checklist item; never “due”                                                        |
| **Service record** | Log entry when a periodic/EOL task is completed or a component is replaced                    |
| **Display wear**   | `Component.wear` — Strava junction sum + baseline (existing)                                  |

## Task kinds

| Kind       | Attachment         | Trigger                         | Due behavior                                  |
| ---------- | ------------------ | ------------------------------- | --------------------------------------------- |
| `touch_up` | Bike               | None                            | Never due; checklist only                     |
| `periodic` | Component category | Distance and/or time (per task) | Due when interval exceeded since last service |
| `eol`      | Component category | Distance (absolute wear)        | Due when active component wear ≥ limit        |

Future kinds (e.g. `recall`, `warranty`) can be added to the enum without new tables.

## Data model

### System templates (`shared/src/maintenance-templates.ts`)

Hardcoded array of default task definitions. Not stored in DB. Each template includes:

| Field               | Notes                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `templateKey`       | Stable id, e.g. `chain-eol`, `rewax-chain`                       |
| `kind`              | `touch_up` \| `periodic` \| `eol`                                |
| `title`             | Display name                                                     |
| `description`       | Optional helper text                                             |
| `componentCategory` | `ComponentCategory` enum value; null for touch-ups               |
| `triggerMode`       | `distance` \| `time` \| `both` (ignored for touch-ups)           |
| `distanceMeters`    | Periodic: interval since last service. EOL: absolute wear limit. |
| `intervalDays`      | For time / both modes                                            |
| `guideUrl`          | Optional default link                                            |

Templates are versioned in code; app updates ship new/changed templates.

### `maintenance_tasks`

Per-bike task instances (built-in copies + custom tasks).

| Column                          | Type             | Notes                                                                     |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| `id`                            | text PK          | UUID                                                                      |
| `bike_id`                       | text FK → bikes  | Cascade delete                                                            |
| `source`                        | text             | `builtin` \| `custom`                                                     |
| `template_key`                  | text nullable    | Set for built-ins; null for custom                                        |
| `kind`                          | text             | `touch_up` \| `periodic` \| `eol`                                         |
| `title`                         | text             |                                                                           |
| `description`                   | text nullable    |                                                                           |
| `component_category`            | text nullable    | Category id from `CATEGORIES`                                             |
| `trigger_mode`                  | text nullable    | `distance` \| `time` \| `both`                                            |
| `distance_meters`               | integer nullable | See kind semantics above                                                  |
| `interval_days`                 | integer nullable |                                                                           |
| `guide_url`                     | text nullable    |                                                                           |
| `enabled`                       | boolean          | Default true; disabled tasks excluded from alerts                         |
| `customized`                    | boolean          | Default false; built-in only; true after user edits template-owned fields |
| `sort_order`                    | integer          | Display order within kind/group                                           |
| `snoozed_until_distance_meters` | integer nullable | Absolute wear threshold; alert suppressed until wear reaches this         |
| `snoozed_until_at`              | integer nullable | ms epoch; alert suppressed until this time                                |
| `created_at`                    | integer          | ms epoch                                                                  |
| `updated_at`                    | integer          | ms epoch                                                                  |

**Indexes:** `(bike_id)`, `(bike_id, template_key)` unique where `template_key IS NOT NULL`

**Template-owned fields** (editing any sets `customized: true` on built-ins):

- `title`, `description`, `component_category`, `trigger_mode`, `distance_meters`, `interval_days`, `guide_url`

**Not customization** (never blocks template sync):

- `enabled`, snooze fields, sort order

**Deletion rules:**

- `source: custom` → allowed
- `source: builtin` → rejected with `BUILTIN_TASK_NOT_DELETABLE`

### `service_records`

Completion history for periodic and EOL tasks.

| Column                     | Type                          | Notes                          |
| -------------------------- | ----------------------------- | ------------------------------ |
| `id`                       | text PK                       | UUID                           |
| `task_id`                  | text FK → maintenance_tasks   |                                |
| `bike_id`                  | text FK → bikes               | Denormalized for queries       |
| `component_id`             | text FK → components nullable | Active component at completion |
| `action`                   | text                          | `serviced` \| `replaced`       |
| `completed_at`             | integer                       | ms epoch                       |
| `notes`                    | text nullable                 |                                |
| `cost`                     | real nullable                 |                                |
| `wear_distance_meters`     | integer nullable              | Snapshot at completion         |
| `wear_moving_time_minutes` | integer nullable              | Snapshot at completion         |
| `created_at`               | integer                       | ms epoch                       |

**Indexes:** `(bike_id, completed_at DESC)`, `(task_id, completed_at DESC)`

Touch-up checklist ticks do **not** create service records.

### Touch-up checklist state (`maintenance_checklist_state`)

Persist last-checked timestamp per touch-up task so the checklist survives refresh. No due logic or alerts.

| Column            | Type                           | Notes               |
| ----------------- | ------------------------------ | ------------------- |
| `task_id`         | text PK FK → maintenance_tasks | Touch-up tasks only |
| `last_checked_at` | integer nullable               | ms epoch            |

## Due status computation

Computed in service layer when resolving tasks (not stored). Returned as GraphQL field on `MaintenanceTask`.

### Status enum

| Status    | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `ok`      | Not due                                                                         |
| `due`     | Threshold reached                                                               |
| `overdue` | Past threshold by margin (optional: >10% beyond interval, or same as due in v1) |
| `snoozed` | Due but suppressed until snooze expires                                         |

For v1, `due` and `overdue` may be equivalent; UI can still distinguish later.

### EOL (`kind: eol`)

1. Resolve active component for `component_category` on bike
2. If none: status `ok`, progress null, metadata `needsComponent: true`
3. Compare `component.wear.distanceMeters` to `distance_meters` limit
4. If snoozed: due only when wear ≥ `snoozed_until_distance_meters`
5. Due when wear ≥ limit (after snooze check)

Progress: `wear / limit` (cap display at 100%+)

### Periodic (`kind: periodic`)

1. Resolve active component for category (same as EOL)
2. Find last `service_records` row for this `task_id` (most recent `completed_at`)
3. Baseline for distance: `lastRecord.wearDistanceMeters` or 0 if never serviced
4. Baseline for time: `lastRecord.completedAt` or task `created_at` if never serviced
5. Distance elapsed: `currentWear - baselineWear`
6. Time elapsed: days since baseline time
7. Compare per `trigger_mode`:
   - `distance`: due when distance elapsed ≥ `distance_meters`
   - `time`: due when days elapsed ≥ `interval_days`
   - `both`: due when **either** threshold met (whichever first)
8. Snooze: suppress until wear ≥ snooze distance and/or now ≥ snoozed_until_at
9. When due and not snoozed: status `due` if progress ratio ≤ **125%** of limit; **`overdue`** if ratio > 125% (see `shared/src/maintenance-progress.ts`)

Progress: show whichever mode is closer to threshold (or both in UI). Client shows amber “due soon” styling for enabled `ok` tasks at **≥ 75%** of limit.

### Touch-up (`kind: touch_up`)

Always `ok`. No progress. Optional `lastCheckedAt` from checklist state.

### Alert count

Count enabled tasks where computed status ∈ `{ due, overdue }` (exclude snoozed and touch-ups). Exposed on `Bike.maintenanceAlertCount` and aggregated on garage list.

Per-component alert count: filter tasks by `component_category` matching component’s category.

## Template seeding and sync

### On `createBike`

After bike insert, copy all templates from `maintenance-templates.ts` into `maintenance_tasks`:

- `source: builtin`, `template_key` set, `customized: false`, `enabled: true`
- Copy template-owned fields

Also run when user explicitly requests (future); not required for v1 beyond create.

### On app update (`syncMaintenanceTemplates`)

Called from migration script or server startup hook (once per deploy):

1. **Insert missing:** For each bike, for each template whose `templateKey` is not present, insert new built-in task
2. **Update defaults:** For each existing built-in where `customized === false`, overwrite template-owned fields from current template definition
3. **Skip customized:** Built-ins with `customized === true` unchanged

Does not disable tasks or delete tasks.

### Reset to default

Mutation `resetMaintenanceTaskToDefault(taskId)`:

- Built-in only
- Copy template-owned fields from current template for `template_key`
- Set `customized: false`
- Clear snooze (optional — recommend clearing snooze on reset)

## Mutations and workflows

### `toggleMaintenanceTask(id, enabled)`

Flip `enabled`. Does not affect `customized`.

### `updateMaintenanceTask(id, input)`

Update editable fields. For built-ins, set `customized: true` if any template-owned field changes.

### `createMaintenanceTask(input)`

Creates `source: custom` task. Requires `bikeId`, `kind`, title, and kind-appropriate trigger fields.

### `deleteMaintenanceTask(id)`

Custom only. Reject built-ins.

### `completeMaintenanceTask(id, input?)`

For periodic tasks:

1. Create `service_record` with `action: serviced`, wear snapshot, optional notes/cost
2. Clear snooze
3. Status returns to `ok` until next interval elapses

For EOL tasks without replacement intent: same as serviced (user acknowledges inspection); does not reset wear.

### `replaceComponentMaintenance(id, input)`

For EOL tasks:

1. Create `service_record` with `action: replaced`
2. Optionally **activate** an existing component in the task’s category (`newComponentId`) and reset wear
3. Users add new parts on the **Components** tab first; replace dialog selects from existing components (no inline create)

If no active component in category: still allow service record; swap is optional.

### `snoozeMaintenanceTask(id, input)`

User picks preset. Server validates against allowed presets:

**Distance presets (meters):** e.g. 50 km, 100 km, 200 km  
**Time presets (days):** e.g. 7, 14, 30

Sets `snoozed_until_distance_meters` = current wear + preset (for distance snooze) and/or `snoozed_until_at` = now + preset days.

### `toggleTouchUpCheckItem(taskId)`

Sets `last_checked_at` on checklist state to now. Toggle-off optional in v1 (can just re-check).

## GraphQL API

New schema module: `server/src/graphql/schema/maintenance.ts`

### Types

```graphql
enum MaintenanceTaskKind {
  touch_up
  periodic
  eol
}
enum MaintenanceTaskSource {
  builtin
  custom
}
enum MaintenanceTaskStatus {
  ok
  due
  overdue
  snoozed
}
enum MaintenanceTriggerMode {
  distance
  time
  both
}
enum ServiceRecordAction {
  serviced
  replaced
}

type MaintenanceTask {
  id: ID!
  bikeId: ID!
  source: MaintenanceTaskSource!
  templateKey: String
  kind: MaintenanceTaskKind!
  title: String!
  description: String
  componentCategory: ComponentCategory
  triggerMode: MaintenanceTriggerMode
  distanceMeters: Int
  intervalDays: Int
  guideUrl: String
  enabled: Boolean!
  customized: Boolean!
  sortOrder: Int!
  status: MaintenanceTaskStatus!
  progress: MaintenanceTaskProgress
  lastServiceRecord: ServiceRecord
  lastCheckedAt: DateTime # touch-ups only
  canDelete: Boolean!
}

type MaintenanceTaskProgress {
  distanceUsedMeters: Int
  distanceLimitMeters: Int
  daysUsed: Int
  daysLimit: Int
  needsComponent: Boolean
}

type ServiceRecord {
  id: ID!
  taskId: ID!
  action: ServiceRecordAction!
  completedAt: DateTime!
  notes: String
  cost: Float
  component: Component
  wearDistanceMeters: Int
  wearMovingTimeMinutes: Int
}
```

### Extensions

```graphql
extend type Bike {
  maintenanceTasks: [MaintenanceTask!]!
  maintenanceAlertCount: Int!
  serviceRecords(limit: Int): [ServiceRecord!]!
}

extend type Component {
  maintenanceTasks: [MaintenanceTask!]!
  maintenanceAlertCount: Int!
}
```

### Mutations

```graphql
createMaintenanceTask(bikeId: ID!, input: MaintenanceTaskInsertInput!): MaintenanceTask!
updateMaintenanceTask(id: ID!, input: MaintenanceTaskUpdateInput!): MaintenanceTask!
toggleMaintenanceTask(id: ID!, enabled: Boolean!): MaintenanceTask!
deleteMaintenanceTask(id: ID!): Boolean!
resetMaintenanceTaskToDefault(id: ID!): MaintenanceTask!
completeMaintenanceTask(id: ID!, input: CompleteMaintenanceInput): ServiceRecord!
replaceComponentMaintenance(id: ID!, input: ReplaceMaintenanceInput!): ServiceRecord!
snoozeMaintenanceTask(id: ID!, input: SnoozeMaintenanceInput!): MaintenanceTask!
toggleTouchUpCheckItem(taskId: ID!): MaintenanceTask!
```

Validation via Zod schemas in `shared/src/schemas/maintenance.ts`.

## Default templates (v1)

See [2026-07-15-maintenance-builtin-tasks-plan.md](./2026-07-15-maintenance-builtin-tasks-plan.md) for full copy, guide URLs, and rollout notes. **17 built-in tasks** (6 touch-up, 6 periodic, 5 EOL).

### Touch-ups (bike-level)

| templateKey      | Title                 |
| ---------------- | --------------------- |
| `pre-ride-check` | Pre-ride safety check |
| `tire-pressure`  | Tire pressure         |
| `inspect-tires`  | Inspect tires         |
| `chain-wipe`     | Wipe / lube chain     |
| `clean-bike`     | Clean bike            |
| `post-wet-ride`  | After wet ride        |

### Periodic (component category)

| templateKey        | Title                     | Category        | Trigger  | Default             |
| ------------------ | ------------------------- | --------------- | -------- | ------------------- |
| `chain-lube`       | Clean & lube chain        | chain           | distance | 300 km              |
| `chain-wear-check` | Check chain wear          | chain           | both     | 800 km / 30 days    |
| `deep-clean`       | Deep clean drivetrain     | chain           | time     | 90 days             |
| `shifting-check`   | Shifting & indexing check | rear-derailleur | both     | 2,000 km / 180 days |
| `brake-inspection` | Brake inspection          | brakes          | both     | 800 km / 90 days    |
| `annual-service`   | Annual bike check         | frame           | time     | 365 days            |

### EOL (absolute wear limit)

| templateKey      | Title              | Category   | Limit    |
| ---------------- | ------------------ | ---------- | -------- |
| `chain-eol`      | Replace chain      | chain      | 3,000 km |
| `brake-pads-eol` | Replace brake pads | brakes     | 2,500 km |
| `cassette-eol`   | Replace cassette   | cassette   | 8,000 km |
| `front-tire-eol` | Replace front tire | front-tire | 6,000 km |
| `rear-tire-eol`  | Replace rear tire  | rear-tire  | 4,000 km |

Each template includes `description` and `guideUrl`. Template updates ship via `syncMaintenanceTemplates` on migrate (see plan doc).

## UI design

### Garage list

- Badge on bike card when `maintenanceAlertCount > 0` (ProBikeGarage-style count)

### Bike detail header

- Alert badge beside bike name; navigates to Maintenance tab

### Bike detail tabs (nested routes)

Routes under `/bikes/$bikeId/`: **Components** (default) | **Overview** | **Maintenance** | **Activities**. Layout in `bike-detail.tsx`; tab paths in `bike-routes.tsx`.

### Maintenance tab

Sections:

1. **Tasks by system group** — periodic + EOL cards with progress ring, Mark done / Snooze / Replace (EOL), guide link; collapsible groups
2. **Touch-up checklist** — bike-level items with checkboxes; no due styling
3. **Service history** — chronological `ServiceRecord` list

Status display: green (ok), amber “due soon” (≥ 75%), red due (100–125%), red overdue (> 125%), cyan snoozed.

### Component list (embedded)

- Warning indicator on component category row when alerts exist for that category
- Badge links to Maintenance tab with `?category=` (scrolls to due task)

### Component detail / category panel

- _Deferred:_ maintenance quick actions on category panel; alerts deep-link to Maintenance tab for now.

### Dialogs

| Dialog          | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| Add custom task | Kind, category select, trigger mode, intervals, guide URL |
| Edit task       | Same fields; built-in sets customized                     |
| Snooze          | Preset chips for km / days                                |
| Replace (EOL)   | Notes; optional swap to existing component + wear reset   |
| Confirm delete  | Custom tasks only                                         |

### Client module (implemented)

`client/src/features/maintenance/`:

- `api.ts` — GraphQL hooks, progress/urgency helpers, cache invalidation
- `MaintenanceTab.tsx` — tab UI (tasks, touch-up, history, dialogs)
- `cache-sync.ts` — alert count sync to bike list/detail caches

Extend `client/src/lib/graphql/operations.ts` with maintenance fragments. System group colors: `client/src/lib/system-group-styles.ts`.

## Error handling

| Case                                  | Response                                                     |
| ------------------------------------- | ------------------------------------------------------------ |
| Delete built-in                       | `BUILTIN_TASK_NOT_DELETABLE`                                 |
| Reset non-built-in                    | `TASK_NOT_RESETTABLE`                                        |
| Snooze touch-up                       | `INVALID_OPERATION_FOR_KIND`                                 |
| Complete disabled task                | `TASK_DISABLED`                                              |
| Invalid snooze preset                 | Validation error                                             |
| Periodic/EOL without active component | Task visible with `needsComponent`; no false due on distance |

## Testing

### Unit / service tests (`server/src/test/maintenance.test.ts`)

- Due computation: EOL absolute limit
- Due computation: periodic distance, time, both (whichever first)
- Snooze suppresses and re-triggers correctly
- Seeding on bike creation
- Template sync: inserts new keys; updates non-customized; skips customized
- Reset to default restores template and clears customized
- Built-in delete rejected; custom delete allowed

### GraphQL tests (`server/src/test/graphql.test.ts`)

- CRUD mutations with auth
- Alert count aggregation
- `Component.maintenanceTasks` filter by category

Use helpers in `server/src/test/graphql-helper.ts` for bike + component setup with wear data.

## Migration plan

1. Add tables: `maintenance_tasks`, `service_records`, `maintenance_checklist_state`
2. Run `syncMaintenanceTemplates` to seed all existing bikes
3. No changes to wear ledger or Strava sync

## Future extensions (out of scope)

- Notification channels (issue #33 comment)
- Time-based touch-up soft reminders
- New built-in kinds via template updates
- Maintenance fields on MCP read tools
- `serviceLimitMeters` denormalized on components (not needed with task model)
- Overdue severity tiers and push escalation

## References

- [Issue #33 — Service / Maintenance](https://github.com/tryy3/MyBike/issues/33)
- Bambuddy — custom service tasks, guide links, hour-based intervals (screenshot in issue)
- ProBikeGarage — alert badges on garage, bike, and component views (screenshots in issue)
