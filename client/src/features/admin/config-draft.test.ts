import { describe, expect, it } from "vite-plus/test";
import {
  draftsFromSettings,
  initialConfigDraftValue,
  mergeConfigDrafts,
  type ConfigDraftSetting,
} from "./config-draft";

const logging: ConfigDraftSetting = {
  key: "logging.level",
  isSecret: false,
  value: "info",
};

const timing: ConfigDraftSetting = {
  key: "graphql.timing",
  isSecret: false,
  value: false,
};

const secret: ConfigDraftSetting = {
  key: "strava.webhook.proxyApiKey",
  isSecret: true,
  value: null,
};

describe("initialConfigDraftValue", () => {
  it("maps booleans, strings, and secrets", () => {
    expect(initialConfigDraftValue(logging)).toBe("info");
    expect(initialConfigDraftValue(timing)).toBe(false);
    expect(initialConfigDraftValue(secret)).toBe("");
  });
});

describe("mergeConfigDrafts", () => {
  it("seeds clean keys from the server payload", () => {
    expect(mergeConfigDrafts([logging, timing], {}, new Set())).toEqual({
      "logging.level": "info",
      "graphql.timing": false,
    });
  });

  it("keeps dirty drafts when the server refetches", () => {
    const merged = mergeConfigDrafts(
      [
        { ...logging, value: "info" },
        { ...timing, value: false },
      ],
      {
        "logging.level": "debug",
        "graphql.timing": false,
      },
      new Set(["logging.level"]),
    );

    expect(merged).toEqual({
      "logging.level": "debug",
      "graphql.timing": false,
    });
  });

  it("refreshes a previously dirty key after dirtyKeys is cleared", () => {
    expect(
      mergeConfigDrafts([{ ...logging, value: "warn" }], { "logging.level": "debug" }, new Set()),
    ).toEqual({ "logging.level": "warn" });
  });
});

describe("draftsFromSettings", () => {
  it("builds a full draft map from settings", () => {
    expect(draftsFromSettings([logging, secret])).toEqual({
      "logging.level": "info",
      "strava.webhook.proxyApiKey": "",
    });
  });
});
