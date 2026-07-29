import { describe, expect, it } from "vite-plus/test";
import { SETTINGS_NAV_SECTIONS, visibleSettingsSections } from "./settings-nav-config";

describe("visibleSettingsSections", () => {
  it("always includes Account with api-keys and integrations", () => {
    const sections = visibleSettingsSections(false);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe("account");
    expect(sections[0]?.items.map((i) => i.to)).toEqual([
      "/settings/api-keys",
      "/settings/integrations",
    ]);
  });

  it("appends Admin section when showAdmin is true", () => {
    const sections = visibleSettingsSections(true);
    expect(sections.map((s) => s.id)).toEqual(["account", "admin"]);
    expect(sections[1]?.items.map((i) => i.to)).toEqual([
      "/settings/admin/configuration",
      "/settings/admin/users",
      "/settings/admin/audit",
    ]);
  });

  it("keeps SETTINGS_NAV_SECTIONS as the full unfiltered source", () => {
    expect(SETTINGS_NAV_SECTIONS.map((s) => s.id)).toEqual(["account", "admin"]);
  });
});
