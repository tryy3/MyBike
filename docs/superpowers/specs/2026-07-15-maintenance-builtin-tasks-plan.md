# Built-in maintenance tasks

**Date:** 2026-07-15  
**Status:** Approved — implemented in `shared/src/maintenance-templates.ts`  
**Related:** [2026-07-14-maintenance-module-design.md](./2026-07-14-maintenance-module-design.md)

Default built-in tasks seeded on bike creation. **17 tasks** total.

## Field mapping

| Column          | Maps to                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| **description** | `MaintenanceTemplate.description` → `maintenance_tasks.description` (max 2,000 chars) |
| **guideUrl**    | `MaintenanceTemplate.guideUrl` — external how-to link                                 |

**Description style:** 2–3 short sentences. What the task is, what to do, and — for periodic/EOL tasks — typical real-world intervals so the user understands the default.

**Guide sources:** [REI Expert Advice](https://www.rei.com/learn/expert-advice), [Park Tool Repair Help](https://www.parktool.com/en-us/blog/repair-help) + [Park Tool YouTube](https://www.youtube.com/@parktool), [GCN / GCN Tech YouTube](https://www.youtube.com/@gcn). See [Guide URL reuse](#guide-url-reuse) for shared links.

---

## Touch-ups (bike-level, checklist only, no due alerts)

| templateKey      | Title                 | description                                                                                                                                                                                                   | guideUrl                                                         |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pre-ride-check` | Pre-ride safety check | Quick every-ride pass before you roll: confirm brakes bite, wheels are seated, stem and seatpost bolts look snug, and the chain isn't dry or rusty. Takes a few minutes and catches most safety issues early. | https://www.rei.com/learn/expert-advice/pre-ride-inspection.html |
| `tire-pressure`  | Tire pressure         | Check and adjust tire pressure before every ride. Correct pressure improves comfort, grip, and puncture resistance.                                                                                           | https://www.youtube.com/watch?v=CBK88bdmqfk                      |
| `inspect-tires`  | Inspect tires         | Weekly look-over for cuts, embedded glass, squaring, sidewall damage, and tread wear. Catches problems that pressure checks alone won't.                                                                      | https://www.rei.com/learn/expert-advice/spring-cycling.html      |
| `chain-wipe`     | Wipe / lube chain     | Light wipe and re-lube when the chain sounds dry or after routine rides. Use this habit whenever the chain chirps or looks grimy — it complements the distance-based lube reminder, not replaces it.          | https://www.youtube.com/watch?v=zyietLL9yNk                      |
| `clean-bike`     | Clean bike            | Frame wipe-down or full wash. Keeping the bike clean makes inspection easier and slows grime buildup on the drivetrain.                                                                                       | https://www.youtube.com/watch?v=B2sKhSDrugE                      |
| `post-wet-ride`  | After wet ride        | After rain or mud: wipe the chain, check brakes, and rinse the drivetrain if heavily gritted. A few minutes now prevents much faster wear later.                                                              | https://www.youtube.com/watch?v=KM6mzE5lQ0w                      |

---

## Periodic (component-linked, due alerts)

| templateKey        | Title                     | Category          | Trigger  | Default interval    | description                                                                                                                                                                                                                                                                                                        | guideUrl                                                                                          |
| ------------------ | ------------------------- | ----------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `chain-lube`       | Clean & lube chain        | `chain`           | distance | 300 km              | Reminder to clean and lubricate the chain. Intervals vary widely: roughly 150–500 km for drip/wet lube, 400–800 km for wax, and sooner after wet or gritty rides. Default 300 km — raise for wax/dry conditions, lower for mud and rain.                                                                           | https://www.parktool.com/en-us/blog/repair-help/chain-cleaning-with-a-park-tool-chain-scrubber    |
| `chain-wear-check` | Check chain wear          | `chain`           | both     | 800 km / 30 days    | Measure elongation with a chain checker before it damages the cassette and rings. Typical checks every 500–1,000 km or monthly on 11/12-speed; replace around 0.5% wear. Default: every 800 km or 30 days, whichever comes first.                                                                                  | https://www.parktool.com/en-us/blog/repair-help/when-to-replace-a-chain-on-a-bicycle              |
| `deep-clean`       | Deep clean drivetrain     | `chain`           | time     | 90 days             | Thorough degrease of the chain, cassette, chainrings, and jockey wheels — separate from quick post-ride wipes. Most riders need this every 3–6 months depending on conditions. Default: every 90 days.                                                                                                             | https://www.youtube.com/watch?v=MuwS_nSevy4                                                       |
| `shifting-check`   | Shifting & indexing check | `rear-derailleur` | both     | 2,000 km / 180 days | Check indexing, limit screws, and smooth shifts under load. Catches cable stretch, hanger issues, and derailleur wear before they become ride-ending. Default: every 2,000 km or 180 days.                                                                                                                         | https://www.youtube.com/watch?v=UkZxPIZ1ngY                                                       |
| `brake-inspection` | Brake inspection          | `brakes`          | both     | 800 km / 90 days    | Inspect pad thickness and wear indicators, rotor or rim rub, and lever feel. Disc and rim brakes differ in detail, but the habit is the same — look before stopping power drops. Rim-brake riders can swap the guide link. Default 800 km or 90 days.                                                              | https://www.youtube.com/watch?v=ZHbTMl6EGJc                                                       |
| `annual-service`   | Annual bike check         | `frame`           | time     | 365 days            | Once a year, work through the whole bike for wear and play — not a shop overhaul, but a deliberate inspection pass. Covers headset and bottom bracket bearings, bar tape or grips, saddle and seatpost, hub play and wheel true, cockpit bolt torque, and a frame/fork visual for damage. Default: every 365 days. | https://www.parktool.com/en-us/blog/calvins-corner/springtime-attention-brings-problem-prevention |

---

## EOL (absolute wear on active component)

Distance limits use **total component wear** (Strava ledger + baseline).

Built-in EOL alerts work best when wear correlates with distance and a default limit is actionable. Chain, cassette, brake pads, and tires fit that model. Chainrings, bottom brackets, and rotors are too variable — cover those via `annual-service` / `brake-inspection`, or a **custom EOL task**.

| templateKey      | Title              | Category     | Default limit | description                                                                                                                                                                                                                                                                    | guideUrl                                                                               |
| ---------------- | ------------------ | ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `chain-eol`      | Replace chain      | `chain`      | 3,000 km      | Replace the chain before elongation wears the cassette and chainrings. Typical lifespan 2,000–5,000 km on 11/12-speed depending on lube and conditions; replace sooner if a wear tool shows 0.5%+. Default limit: 3,000 km total wear.                                         | https://www.parktool.com/en-us/blog/repair-help/chain-replacement-derailleur-bikes     |
| `cassette-eol`   | Replace cassette   | `cassette`   | 8,000 km      | Replace when a new chain skips under load or cogs show significant wear. Usually lasts roughly two to three chains (often 8,000–16,000 km). Default limit: 8,000 km total wear.                                                                                                | https://www.parktool.com/en-us/blog/repair-help/cassette-removal-and-installation      |
| `brake-pads-eol` | Replace brake pads | `brakes`     | 2,500 km      | Replace when pad material is below safe thickness or stopping power is reduced. Highly variable: disc resin often 800–3,200 km, rim pads 2,000–5,000 km. Default limit: 2,500 km total wear — conservative for wet and hilly riding. Rim-brake riders can swap the guide link. | https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation    |
| `rear-tire-eol`  | Replace rear tire  | `rear-tire`  | 4,000 km      | Rear tires wear faster than fronts — replace when the profile squares off, casing shows, or flats become frequent. Typical road rear life 3,000–6,000 km. Default limit: 4,000 km total wear.                                                                                  | https://www.parktool.com/en-us/blog/repair-help/tire-and-tube-removal-and-installation |
| `front-tire-eol` | Replace front tire | `front-tire` | 6,000 km      | Front tires often last longer than rears but still need replacing for deep cuts, age, or squared tread. Typical front life roughly 1.5–2× the rear on road. Default limit: 6,000 km total wear.                                                                                | https://www.parktool.com/en-us/blog/repair-help/tire-and-tube-removal-and-installation |

---

## Summary

| Kind      | Count  |
| --------- | ------ |
| Touch-up  | 6      |
| Periodic  | 6      |
| EOL       | 5      |
| **Total** | **17** |

---

## Guide URL reuse

Several tasks share one guide because a single article or video covers multiple steps. Double-check these mappings before implementation.

| Guide URL                                                                                         | Used by                           | Notes                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| https://www.rei.com/learn/expert-advice/pre-ride-inspection.html                                  | `pre-ride-check`                  | REI ABC check (air, brakes, chain, wheels, bolts). Also useful context for `brake-inspection` lever-feel checks.                                                           |
| https://www.rei.com/learn/expert-advice/spring-cycling.html                                       | `inspect-tires`                   | Tire sidewall, tread, and inflation section of seasonal prep. Wear signs overlap with tire EOL descriptions.                                                               |
| https://www.rei.com/learn/expert-advice/bike-tires.html                                           | — (optional)                      | Not assigned to a task; good supplemental “when to replace” read for `front-tire-eol` / `rear-tire-eol`.                                                                   |
| https://www.youtube.com/watch?v=CBK88bdmqfk                                                       | `tire-pressure`                   | REI — choosing tire PSI.                                                                                                                                                   |
| https://www.youtube.com/watch?v=zyietLL9yNk                                                       | `chain-wipe`                      | GCN Tech — quick wipe-and-lube technique.                                                                                                                                  |
| https://www.youtube.com/watch?v=KM6mzE5lQ0w                                                       | `post-wet-ride`                   | GCN — chain clean after gritty/wet rides.                                                                                                                                  |
| https://www.youtube.com/watch?v=B2sKhSDrugE                                                       | `clean-bike`                      | Park Tool — full bike wash (drivetrain + wheels + frame).                                                                                                                  |
| https://www.parktool.com/en-us/blog/repair-help/chain-cleaning-with-a-park-tool-chain-scrubber    | `chain-lube`                      | Park Tool article; same clean-and-lube flow as `deep-clean` video.                                                                                                         |
| https://www.youtube.com/watch?v=MuwS_nSevy4                                                       | `deep-clean`                      | Park Tool — degrease + rinse + lube (chain, pulleys, rings, cassette).                                                                                                     |
| https://www.parktool.com/en-us/blog/repair-help/when-to-replace-a-chain-on-a-bicycle              | `chain-wear-check`                | Park Tool — chain checker methods and wear limits. Pair with https://www.youtube.com/watch?v=gXd-3UnqoaM for video.                                                        |
| https://www.youtube.com/watch?v=UkZxPIZ1ngY                                                       | `shifting-check`                  | Park Tool — indexing and limit screws.                                                                                                                                     |
| https://www.youtube.com/watch?v=ZHbTMl6EGJc                                                       | `brake-inspection`                | Park Tool — disc pad thickness inspection. **Rim brake alternate:** https://www.parktool.com/en-us/blog/repair-help/brake-pad-replacement-rim-brakes                       |
| https://www.parktool.com/en-us/blog/calvins-corner/springtime-attention-brings-problem-prevention | `annual-service`                  | Park Tool — wheels, frame, bearings, cables, seasonal overhaul mindset. Headset detail: https://www.parktool.com/en-us/blog/repair-help/how-to-adjust-a-threadless-headset |
| https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation               | `brake-pads-eol`                  | Park Tool — disc pad replace. **Rim brake alternate:** https://www.parktool.com/en-us/blog/repair-help/brake-pad-replacement-rim-brakes                                    |
| https://www.parktool.com/en-us/blog/repair-help/tire-and-tube-removal-and-installation            | `front-tire-eol`, `rear-tire-eol` | Park Tool — clincher replace. **Tubeless:** https://www.parktool.com/en-us/blog/repair-help/tubeless-tire-mounting-and-repair                                              |

---

## Not built-in

| Item                                 | Reason                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Chainrings / BB / rotor EOL          | Lifespan too unpredictable for km defaults; custom EOL if wanted                                    |
| Cable/housing tasks                  | No `cables` component category                                                                      |
| Chain↔cassette coupling              | Not in v1 — cassette EOL is a fixed km default                                                      |
| Suspension service                   | No fork/shock service categories                                                                    |
| Trainer-specific tasks               | Niche — custom tasks                                                                                |
| Separate rim vs disc brake built-ins | One task covers the same inspection habit; guide URL is user-editable (see [Decisions](#decisions)) |

---

## Decisions

### Category proxies

**Decision:** Use `chain` for `deep-clean` and `frame` for `annual-service` until bike-level periodic tasks exist.

Periodic tasks need a component category for wear/due context. These two tasks are really bike-wide checklists; the category is a proxy for grouping in the Components tab, not a strict component binding.

### `annual-service` interval

**Decision:** **Time only** — `triggerMode: time`, `intervalDays: 365`. No distance component.

An annual inspection is calendar-driven for most riders; mixing in 5,000 km would double-alert high-mileage users unnecessarily.

### Rim vs disc brake guides

**Decision:** **One built-in per brake task** (`brake-inspection`, `brake-pads-eol`), default guide URLs aimed at **disc** (Park Tool disc pad video/article — most common on newer bikes).

**Why not two built-ins?** The inspection checklist is the same (pad thickness, rub, lever feel). Separate guides exist because the _procedure_ differs, not the _reminder_. Users on rim brakes can change the guide URL on the built-in (counts as customization; sync won't overwrite until reset). Descriptions mention rim riders can swap the link; rim alternates are listed in [Guide URL reuse](#guide-url-reuse).

A future enhancement could pick default guide from active brake component metadata — not needed for v1.

### Show `description` in UI

**Decision:** Yes — show under the task title on each maintenance card (muted body text). Guide link stays in the action row.

---

## Template rollout (migration model)

Built-in task **content** is not stored in Drizzle SQL migrations. It lives in code (`MAINTENANCE_TEMPLATES`) and is pushed to existing bikes by **`syncMaintenanceTemplates()`**, which runs at the end of `applyMigrations()` (`npm run -w server db:migrate`, prod `RUN_MIGRATIONS=true`, test setup).

| Event                               | Behavior                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| New bike                            | `seedMaintenanceTasksForBike` inserts all current templates                         |
| App update / `db:migrate`           | Sync **inserts** missing `templateKey`, **updates** non-`customized` rows from code |
| User changed intervals or guide URL | `customized: true` → sync **skips** that row until **Reset to default**             |
| User disabled task / snoozed        | Unaffected — sync never touches `enabled` or snooze fields                          |
| Removed `templateKey` from code     | **Not auto-deleted** — orphaned rows remain (future: retirement map if needed)      |

### This release (pre-publish, one sweep)

Nothing is in production yet, so we ship the full 17-task set in one change — no multi-phase retirement.

| Old key (dev scaffold) | Action                                              |
| ---------------------- | --------------------------------------------------- |
| `rewax-chain`          | Renamed → `chain-lube` (new key, new copy/interval) |
| `bolt-check`           | Dropped — bolt check folded into `pre-ride-check`   |
| `bar-tape-check`       | Dropped — folded into `annual-service`              |

For **future** template changes after users exist, follow the same sync model: edit `maintenance-templates.ts`, run migrate, rely on `customized` + reset. Renames or removals may need an explicit retirement map in `syncMaintenanceTemplates` when real user data is at stake.

---

## Implementation checklist

- [x] Update `shared/src/maintenance-templates.ts` with 17 tasks + intervals
- [x] Copy **description** and **guideUrl** into each template
- [x] Run / verify `syncMaintenanceTemplates` for existing bikes (`db:migrate`)
- [x] Update `2026-07-14-maintenance-module-design.md` default templates table
- [x] Adjust `server/src/test/maintenance.test.ts` (count + sync tests)
- [x] Surface **description** and guide link in Maintenance tab UI
