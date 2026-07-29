# Admin Configuration Settings UI

> **Status: IMPLEMENTED.** Env-source badges / env-override read-only behavior in this doc were removed with seed-if-absent (`source` is now `database` | `default` | `inherited` only).

**Date:** 2026-07-28  
**Status:** Approved  
**Context:** The admin configuration page uses nested cards per group and bordered boxes per setting, which wastes vertical space and will not scale as the settings registry grows.

## Summary

Replace the card-stack layout with a **hybrid settings panel**: Cursor-style rows (label + short description | control), expandable detail for keys and longer help, a light filter, compact section headers with icons, one accent blue for chrome, and multicolor semantic hints for source/effect.

## Goals

- Dense, scannable layout that still leaves room for operator metadata
- Scale to dozens of settings without a sidebar (filter first)
- Keep save / dirty / restart / env-override behavior unchanged

## Non-goals

- Settings sidebar or VS Code–style TOC (defer until the list is much larger)
- Per-section rainbow colors
- Optimistic UI for settings saves
- Changing the settings registry precedence model

## Decisions

| Topic          | Choice                                                                             |
| -------------- | ---------------------------------------------------------------------------------- |
| Layout         | Single panel; section headers + expandable rows; no nested setting cards           |
| Section header | Icon + title only; shared accent blue (`chart-1`); tight padding; no section blurb |
| Row            | Label + short description left; control right                                      |
| Detail         | Click row to expand: mono key, long/help notes, env/secret copy                    |
| Filter         | One text filter over label + key (+ description)                                   |
| Chrome color   | One accent (`chart-1` blue) for icons, rails, checked switches, keys               |
| Semantic color | Distinct colors for restart / database / env hints (and log-level dots)            |
| Descriptions   | Declared on the settings registry; exposed via GraphQL                             |
| Save           | Keep single header Save for dirty settings                                         |

## Color language

| Signal           | Treatment                                                |
| ---------------- | -------------------------------------------------------- |
| Accent chrome    | `chart-1` (icon tile, left rail, switch on, key text)    |
| Database source  | Success / emerald text (only when `source === database`) |
| Env source       | Cyan / chart-6 text (only when `source === env`)         |
| Restart required | Amber text (only when `effect === restartRequired`)      |
| Log levels       | Semantic dots (trace→error) on the select trigger        |

Default-source and hot-reload settings do not show source/effect chrome on the primary row.

## Interaction

- Filter narrows visible settings; empty groups hide
- Expanding a row reveals detail; controls stop propagation so toggling does not collapse
- Env-overridden fields remain read-only with explanation in the expanded detail
- Restart pending banner and restart action stay at the top

## Out of scope follow-ups

- Sticky dirty save bar
- Copy-key button
- Moving accent to a dedicated design token if `chart-1` is reused elsewhere awkwardly
