# Admin Audit for All Admin Actions

> **Status: IMPLEMENTED.**

**Date:** 2026-07-28  
**Status:** Approved  
**Context:** The admin audit page and `config_audit_log` currently record only runtime configuration changes. Role assignment and server restart are admin mutations but leave no audit trail.

## Summary

Reuse `config_audit_log` with a shared write helper and reserved synthetic keys so **all current admin mutations** appear in one chronologically ordered log. Keep the existing GraphQL query and table columns; improve audit page copy and key labels for non-config rows.

## Goals

- Log config changes, role assignments, and server restarts in one audit trail
- Keep storage on the existing `config_audit_log` shape (no schema migration)
- Make non-config rows readable in the current When / Key / Old / New / Actor table
- Centralize inserts behind one helper so future admin actions can follow the same pattern

## Non-goals

- Renaming the table or GraphQL field (`adminConfigAudit`)
- Generalizing to a typed `action` / payload schema
- Filter / search UI for the audit page
- Resolving actor or target user IDs to email in the UI
- Auditing read-only admin queries

## Decisions

| Topic      | Choice                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| Scope      | Config + `assignUserRole` + `restartServer`                                                  |
| Storage    | Existing `config_audit_log` (`key`, `old_value`, `new_value`, `actor_user_id`, `created_at`) |
| Write path | Shared `writeAdminAudit` helper                                                              |
| API        | Keep `adminConfigAudit` unchanged                                                            |
| UI         | Same columns; friendlier labels for synthetic keys; updated page copy                        |

## Key conventions

| Action         | `key`                               | `old_value` / `new_value`                                           |
| -------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Setting change | Registry key (e.g. `logging.level`) | Unchanged; secrets remain `***`                                     |
| Role change    | `users.role:<userId>`               | JSON string of previous role → new role (e.g. `"user"` → `"admin"`) |
| Restart        | `server.restart`                    | Both `null`                                                         |

Reserved prefixes `users.role:` and exact key `server.restart` must not collide with settings registry keys.

## Architecture

```text
updateAdminSettings ─┐
assignUserRole ──────┼─► writeAdminAudit ─► config_audit_log
restartServer ───────┘
                              ▲
adminConfigAudit ─────────────┘ (read, unchanged)
```

- **Helper:** `server/src/services/admin-audit.ts` exports `writeAdminAudit({ actorUserId, key, oldValue, newValue })`.
- **Config:** `appConfig.set` calls the helper instead of a raw `INSERT`.
- **Roles:** `assignUserRole` accepts `actorUserId`, writes the role, then audits previous → new role.
- **Restart:** GraphQL `restartServer` writes an audit row after permission check, then requests process restart.
- **Client:** role and restart mutations invalidate `["admin", "audit"]` (settings save already does).

## UI

- Subtitle: review recent admin changes (not config-only).
- Card description: secrets redacted; role changes and restarts included.
- Key column display:
  - Config: mono key as today
  - `users.role:<userId>` → `Role · <userId>`
  - `server.restart` → `Server restart`
- Old/New: mono; `null` → `—` (restart rows show `—` / `—`).

## Testing

- Existing config audit assertion remains.
- `assignUserRole` produces an audit row with `users.role:<userId>` and expected old/new roles.
- `restartServer` produces an audit row with key `server.restart`.

## Out of scope follow-ups

- Rename table / GraphQL to `admin_audit` / `adminAudit`
- Join actor/target to email in the audit UI
- Typed event schema if admin actions grow beyond key/old/new
