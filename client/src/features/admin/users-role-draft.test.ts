import { describe, expect, it } from "vite-plus/test";
import {
  applyRoleDraft,
  dirtyRoleAssignments,
  effectiveRole,
  reconcileRoleDrafts,
} from "./users-role-draft";

describe("effectiveRole", () => {
  it("returns the draft when present", () => {
    expect(effectiveRole("u1", "user", { u1: "admin" })).toBe("admin");
  });

  it("returns the server role when no draft", () => {
    expect(effectiveRole("u1", "user", {})).toBe("user");
  });
});

describe("applyRoleDraft", () => {
  it("stores a draft that differs from the server role", () => {
    expect(applyRoleDraft({}, "u1", "user", "admin")).toEqual({ u1: "admin" });
  });

  it("clears the draft when the next role matches the server", () => {
    expect(applyRoleDraft({ u1: "admin" }, "u1", "user", "user")).toEqual({});
  });

  it("does not mutate the previous drafts object", () => {
    const prev = { u1: "admin" as const };
    const next = applyRoleDraft(prev, "u2", "user", "admin");
    expect(prev).toEqual({ u1: "admin" });
    expect(next).toEqual({ u1: "admin", u2: "admin" });
  });
});

describe("dirtyRoleAssignments", () => {
  it("lists only users whose draft differs from the server role", () => {
    const users = [
      { id: "u1", role: "user" as const },
      { id: "u2", role: "admin" as const },
      { id: "u3", role: "user" as const },
    ];
    expect(dirtyRoleAssignments(users, { u1: "admin", u2: "admin", u3: "user" })).toEqual([
      { userId: "u1", role: "admin" },
    ]);
  });

  it("ignores draft keys for users not in the list", () => {
    expect(dirtyRoleAssignments([{ id: "u1", role: "user" }], { gone: "admin" })).toEqual([]);
  });

  it("excludes the current user's draft", () => {
    const users = [
      { id: "self", role: "admin" as const },
      { id: "other", role: "user" as const },
    ];
    expect(dirtyRoleAssignments(users, { self: "user", other: "admin" }, "self")).toEqual([
      { userId: "other", role: "admin" },
    ]);
  });
});

describe("reconcileRoleDrafts", () => {
  it("drops drafts that now match the server after refetch", () => {
    const users = [
      { id: "u1", role: "admin" as const },
      { id: "u2", role: "user" as const },
    ];
    expect(reconcileRoleDrafts(users, { u1: "admin", u2: "admin" })).toEqual({ u2: "admin" });
  });

  it("drops drafts for users no longer present", () => {
    expect(reconcileRoleDrafts([], { u1: "admin" })).toEqual({});
  });
});
