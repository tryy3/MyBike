# Admin Users Manual Save

**Date:** 2026-07-28  
**Status:** Approved  
**Context:** Admin Configuration uses an explicit Save for dirty settings, while Admin Users applies role changes immediately on select. Accidental role changes are too easy; admin actions should require an intentional save.

## Summary

Change Admin Users role editing to **draft + page-level Save**, matching the Configuration page pattern. Selects update local draft state only; a header Save button commits all pending role updates.

## Goals

- Prevent accidental role changes
- Align save UX with Admin Configuration
- Keep self-role protection and existing GraphQL mutation

## Non-goals

- Discard / reset button (follow-up if needed)
- Confirm dialogs per change
- New batch `assignUserRoles` GraphQL mutation
- Optimistic UI

## Decisions

| Topic       | Choice                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| Save model  | Page-level Save for all dirty role drafts                               |
| Draft state | Map of `userId → role` (or equivalent); dirty when ≠ server role        |
| Header Save | Same placement as Configuration: title row, `Save N changes` / disabled |
| Mutation    | Existing `assignUserRole` per dirty user                                |
| Pending UX  | Spinner on Save button through mutations + refetch; no optimistic UI    |
| Self role   | Remains disabled; cannot appear in drafts                               |

## Interaction

1. Load users from server; selects show server roles.
2. Changing a select updates draft only; row may show a subtle dirty hint if useful, but is not required for v1.
3. Save is disabled when `dirtyCount === 0` or while saving.
4. On Save: call `assignUserRole` for each dirty user (parallel via `Promise.all` is fine).
5. On full success: toast, refetch users, clear drafts.
6. On any failure: error toast with message; keep drafts for failed/remaining users so the admin can retry. Successfully applied roles may already be on the server — after partial failure, refetch and re-derive drafts from server vs remaining local intent (prefer: refetch, then clear drafts that now match server).

## Copy

- Card description: “Change roles below, then save. Changes are not applied until you save.”
- Save button: `Save changes` when clean; `Save N change(s)` when dirty; `Saving…` while pending.

## Out of scope follow-ups

- Discard button
- Sticky dirty save bar
- Server-side batch role assignment
