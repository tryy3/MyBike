import { describe, expect, it } from "vite-plus/test";
import { formatAdminAuditKey } from "./audit-display";

describe("formatAdminAuditKey", () => {
  it("labels server restart", () => {
    expect(formatAdminAuditKey("server.restart")).toBe("Server restart");
  });

  it("labels role changes with the target user id", () => {
    expect(formatAdminAuditKey("users.role:abc-123")).toBe("Role · abc-123");
  });

  it("leaves config keys unchanged", () => {
    expect(formatAdminAuditKey("logging.level")).toBe("logging.level");
  });
});
